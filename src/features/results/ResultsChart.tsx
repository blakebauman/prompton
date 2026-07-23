import { useEffect, useMemo, useState } from "react";
import { BarChart3, ChartColumn, ChartLine, Table2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import { useArtifact } from "@/components/artifact/artifact-context";
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

const POINT_CAP = 100;

function isNumericCell(value: unknown): boolean {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    !Number.isNaN(Number(value))
  ) {
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
  const { open: openArtifact } = useArtifact();
  const [chartKind, setChartKind] = useState<ChartKind>("bar");
  const [categoryCol, setCategoryCol] = useState<string>("");
  const [valueCols, setValueCols] = useState<string[]>([]);

  const columns = result?.columns ?? [];
  const rows = result?.rows ?? [];

  useEffect(() => {
    setCategoryCol("");
    setValueCols([]);
    setChartKind("bar");
  }, [result?.queryId]);

  const inferred = useMemo(() => {
    if (!result || columns.length === 0 || rows.length === 0) {
      return { category: "", values: [] as string[] };
    }
    const sample = rows.slice(0, Math.min(rows.length, 40));
    const numericIdx = columns
      .map((c, i) => ({ name: c.name, i }))
      .filter(({ i }) => sample.some((r) => isNumericCell(r[i])));
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
  const activeValues = valueCols.length > 0 ? valueCols : inferred.values;

  const chartData = useMemo(() => {
    if (!result || !activeCategory || activeValues.length === 0) return [];
    const catIdx = columns.findIndex((c) => c.name === activeCategory);
    const valIdx = activeValues.map((name) =>
      columns.findIndex((c) => c.name === name),
    );
    if (catIdx < 0 || valIdx.some((i) => i < 0)) return [];

    const limit = Math.min(rows.length, POINT_CAP);
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
        dashed
        className="min-h-40 p-4"
        icon={<ChartColumn className="size-8" />}
        title="No results to chart"
        description="Run a query with at least one numeric column, then open Chart."
        actions={
          <Button size="xs" variant="outline" onClick={() => openArtifact("sql")}>
            Open SQL
          </Button>
        }
      />
    );
  }

  if (inferred.values.length === 0) {
    return (
      <EmptyState
        dashed
        className="min-h-40 p-4"
        icon={<ChartColumn className="size-8" />}
        title="No numeric columns"
        description="Charts need numeric values in the loaded result set."
        actions={
          <Button
            size="xs"
            variant="outline"
            onClick={() => openArtifact("results")}
          >
            <Table2 className="size-3.5" />
            Open Results
          </Button>
        }
      />
    );
  }

  const ChartImpl = chartKind === "line" ? LineChart : BarChart;
  const truncated = rows.length > POINT_CAP;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <div className="flex items-center gap-0.5">
            <Button
              size="xs"
              variant={chartKind === "bar" ? "secondary" : "ghost"}
              aria-pressed={chartKind === "bar"}
              onClick={() => setChartKind("bar")}
            >
              <BarChart3 className="size-3.5" />
              Bar
            </Button>
            <Button
              size="xs"
              variant={chartKind === "line" ? "secondary" : "ghost"}
              aria-pressed={chartKind === "line"}
              onClick={() => setChartKind("line")}
            >
              <ChartLine className="size-3.5" />
              Line
            </Button>
          </div>
          <span aria-hidden className="text-border">
            |
          </span>
          <div className="flex items-center gap-1">
            <span className="hidden text-[10px] tracking-wide text-muted-foreground uppercase sm:inline">
              X
            </span>
            <Select
              value={activeCategory}
              onValueChange={(v) => setCategoryCol(v)}
            >
              <SelectTrigger size="sm" className="w-[128px]">
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
          </div>
          <div className="flex items-center gap-1">
            <span className="hidden text-[10px] tracking-wide text-muted-foreground uppercase sm:inline">
              Y
            </span>
            <MultiSelect
              className="h-7 max-w-[180px] min-w-[120px]"
              options={seriesOptions}
              value={activeValues}
              onChange={(next) => setValueCols(next.slice(0, 5))}
              placeholder="Series…"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="hidden px-1 text-[11px] text-muted-foreground tabular-nums @min-[420px]:inline">
            {chartData.length.toLocaleString()} pts
            {truncated ? ` · first ${POINT_CAP}` : ""}
          </span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => openArtifact("results")}
          >
            <Table2 className="size-3.5" />
            Results
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-2.5">
        {activeValues.length === 0 || chartData.length === 0 ? (
          <EmptyState
            className="min-h-40 p-4"
            title="Pick a series"
            description="Select one or more numeric columns to plot on Y."
          />
        ) : (
          <ChartContainer
            config={chartConfig}
            className="h-full w-full aspect-auto [&_.recharts-cartesian-grid-horizontal_line]:stroke-border/50 [&_.recharts-cartesian-grid-vertical_line]:stroke-border/40"
          >
            <ChartImpl
              data={chartData}
              margin={{ left: 4, right: 8, top: 8, bottom: 0 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                minTickGap={28}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fontSize: 11 }}
              />
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
                    isAnimationActive={false}
                  />
                ) : (
                  <Bar
                    key={name}
                    dataKey={name}
                    fill={`var(--color-${name})`}
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
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
