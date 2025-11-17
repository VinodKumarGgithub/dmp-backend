PBM Transaction Service - Architecture

- Multi-tenant via `tenantResolver` that resolves tenant and attaches `req.db`
- Sequelize (MySQL) per-tenant connection via `TENANT_DB_URL_TEMPLATE`
- Models auto-initialized in `models/index.js`
- Services encapsulate business logic; controllers are thin
- Centralized logging via Winston and consistent API responses


