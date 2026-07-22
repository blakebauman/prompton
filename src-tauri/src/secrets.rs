use keyring::Entry;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

pub struct SecretStore {
    service: String,
}

impl SecretStore {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }

    fn entry(&self, id: &Uuid) -> AppResult<Entry> {
        Entry::new(&self.service, &format!("conn-{id}"))
            .map_err(|e| AppError::msg(format!("Keyring error: {e}")))
    }

    pub fn set_password(&self, id: &Uuid, password: &str) -> AppResult<()> {
        self.entry(id)?
            .set_password(password)
            .map_err(|e| AppError::msg(format!("Failed to store password: {e}")))
    }

    pub fn get_password(&self, id: &Uuid) -> AppResult<Option<String>> {
        match self.entry(id)?.get_password() {
            Ok(p) => Ok(Some(p)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::msg(format!("Failed to read password: {e}"))),
        }
    }

    pub fn delete_password(&self, id: &Uuid) -> AppResult<()> {
        match self.entry(id)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::msg(format!("Failed to delete password: {e}"))),
        }
    }

    pub fn set_api_key(&self, provider: &str, key: &str) -> AppResult<()> {
        Entry::new(&self.service, &format!("api-{provider}"))
            .map_err(|e| AppError::msg(format!("Keyring error: {e}")))?
            .set_password(key)
            .map_err(|e| AppError::msg(format!("Failed to store API key: {e}")))
    }

    pub fn get_api_key(&self, provider: &str) -> AppResult<Option<String>> {
        match Entry::new(&self.service, &format!("api-{provider}"))
            .map_err(|e| AppError::msg(format!("Keyring error: {e}")))?
            .get_password()
        {
            Ok(p) => Ok(Some(p)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::msg(format!("Failed to read API key: {e}"))),
        }
    }
}
