-- Preserve all existing rows; conflicting client IDs must be resolved before deployment.
CREATE UNIQUE INDEX "companies_bankClientId_key" ON "companies"("bankClientId");
