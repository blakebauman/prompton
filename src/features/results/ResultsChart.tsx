import { useMemo, useState } from "react";
import { BarChart3, ChartLine } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/stores/workspace";

type ChartKind = "bar" | "line";

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function isNumericCell(value: unknown): boolean {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return true;
  }
  return false;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Chart query result columns — bar/line over loaded rows. */
export function ResultsChart() {
  const { result } = useWorkspace();
  const [chartKind, setChartKind] = useState<ChartKind>("bar");
  const [categoryCol, setCategoryCol] = useState<string>("");
  const [valueCols, setValueCols] = useState<string[]>([]);

  const columns = result?.columns ?? [];
  const rows = result?.rows ?? [];

  const inferred = useMemo(() => {
    if (!result || columns.length === 0 || rows.length === 0) {
      return { category: "", values: [] as string[] };
    }
    const numericIdx = columns
      .map((c, i) => ({ name: c.name, i }))
      .filter(({ i }) =>
        rows.slice(0, Math.min(rows.length, 40)).some((r) => isNumericCell(r[i])),
      );
    const nonNumeric = columns.filter(
      (c) => !numericIdx.some((n) => n.name === c.name),
    );
    const category = nonNumeric[0]?.name ?? columns[0]?.name ?? "";
    const values = numericIdx
      .map((n) => n.name)
      .filter((n) => n !== category)
      .slice(0, 3);
    return { category, values };
  }, [result, columns, rows]);

  const activeCategory = categoryCol || inferred.category;
  const activeValues =
    valueCols.length > 0 ? valueCols : inferred.values;

  const chartData = useMemo(() => {
    if (!result || !activeCategory || activeValues.length === 0) return [];
    const catIdx = columns.findIndex((c) => c.name === activeCategory);
    const valIdx = activeValues.map((name) =>
      columns.findIndex((c) => c.name === name),
    );
    if (catIdx < 0 || valIdx.some((i) => i < 0)) return [];

    const limit = Math.min(rows.length, 100);
    return rows.slice(0, limit).map((row, rowIndex) => {
      const point: Record<string, string | number> = {
        label: String(row[catIdx] ?? `#${rowIndex + 1}`),
      };
      for (let i = 0; i < activeValues.length; i++) {
        const name = activeValues[i]!;
        const n = toNumber(row[valIdx[i]!]);
        point[name] = n ?? 0;
      }
      return point;
    });
  }, [result, columns, rows, activeCategory, activeValues]);

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {
      label: { label: activeCategory || "Category" },
    };
    activeValues.forEach((name, i) => {
      config[name] = {
        label: name,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      };
    });
    return config;
  }, [activeCategory, activeValues]);

  const seriesOptions = useMemo(() => {
    const names = columns
      .map((c) => c.name)
      .filter(
        (n) =>
          n !== activeCategory &&
          rows.some((r) =>
            isNumericCell(r[columns.findIndex((c) => c.name === n)]),
          ),
      );
    return names.map((name) => ({ value: name, label: name }));
  }, [columns, rows, activeCategory]);

  if (!result) {
    return (
      <EmptyState
        title="No results to chart"
        description="Run a query with at least one numeric column, then open Chart."
      />
    );
  }

  if (inferred.values.length === 0) {
    return (
      <EmptyState
        title="No numeric columns"
        description="Charts need numeric values in the loaded result set."
      />
    );
  }

  const ChartImpl = chartKind === "line" ? LineChart : BarChart;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 flex-wrap items-center gap-1.5 border-b border-border/60 px-2">
        <div className="flex items-center gap-0.5">
          <Button
            size="xs"
            variant={chartKind === "bar" ? "secondary" : "ghost"}
            onClick={() => setChartKind("bar")}
          >
            <BarChart3 className="size-3.5" />
            Bar
          </Button>
          <Button
            size="xs"
            variant={chartKind === "line" ? "secondary" : "ghost"}
            onClick={() => setChartKind("line")}
          >
            <ChartLine className="size-3.5" />
            Line
          </Button>
        </div>
        <Select
          value={activeCategory}
          onValueChange={(v) => setCategoryCol(v)}
        >
          <SelectTrigger size="sm" className="w-[140px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {columns.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MultiSelect
          className="max-w-[200px]"
          options={seriesOptions}
          value={activeValues}
          onChange={(next) => setValueCols(next.slice(0, 5))}
          placeholder="Series…"
        />
        <span className="ml-auto text-[11px] text-muted-foreground">
          {chartData.length} points
          {rows.length > 100 ? " · first 100 loaded" : ""}
        </span>
      </div>

      <div className="min-h-0 flex-1 p-3">
        {activeValues.length === 0 || chartData.length === 0 ? (
          <EmptyState
            title="Pick a series"
            description="Select one or more numeric columns to plot."
          />
        ) : (
          <ChartContainer config={chartConfig} className="h-full w-full aspect-auto">
            <ChartImpl data={chartData} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis tickLine={false} axisLine={false} width={48} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {activeValues.map((name) =>
                chartKind === "line" ? (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={`var(--color-${name})`}
                    strokeWidth={2}
                    dot={false}
                  />
                ) : (
                  <Bar
                    key={name}
                    dataKey={name}
                    fill={`var(--color-${name})`}
                    radius={3}
                  />
                ),
              )}
            </ChartImpl>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
