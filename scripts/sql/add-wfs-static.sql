-- WFS static knobs (LOC / notes / property / Fidelity). Live AR/AP + Plaid stay in FoundationData / PlaidDB views.

IF OBJECT_ID('dbo.Wfs_StaticItems', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Wfs_StaticItems (
    Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    CompanyKey nvarchar(40) NOT NULL,
    OurEntityId int NULL,
    Kind nvarchar(40) NOT NULL,
    Label nvarchar(200) NOT NULL,
    Amount decimal(18,2) NOT NULL,
    AsOfDate date NULL,
    SortOrder int NOT NULL CONSTRAINT DF_Wfs_StaticItems_Sort DEFAULT 0,
    UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Wfs_StaticItems_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Wfs_StaticItems_OurEntity FOREIGN KEY (OurEntityId) REFERENCES dbo.Ref_OurEntities(EntityID)
  );
  CREATE INDEX IX_Wfs_StaticItems_Company ON dbo.Wfs_StaticItems (CompanyKey, Kind);
END

IF NOT EXISTS (SELECT 1 FROM dbo.Wfs_StaticItems)
BEGIN
  INSERT INTO dbo.Wfs_StaticItems (CompanyKey, OurEntityId, Kind, Label, Amount, AsOfDate, SortOrder) VALUES
    (N'goel', 1, N'loc_limit', N'Goel LOC limit', 4600000, NULL, 10),
    (N'goel', 1, N'loc_drawn', N'Goel LOC 1085 **0189', 3700000, NULL, 11),
    (N'goel', 1, N'pnote', N'Goel Note 1 (Asha)', 750000, NULL, 12),
    (N'goel', 1, N'pnote', N'Goel Note 2 (Asha)', 450000, NULL, 13),
    (N'goel', 1, N'equipment_loan', N'Goel EQUIP 2058-2059 **0070', 4132.56, NULL, 14),
    (N'dcb', 3, N'loc_limit', N'DCB LOC limit', 500000, NULL, 20),
    (N'dcb', 3, N'loc_drawn', N'DE CORNERSTONE LOC 1085 **6189', 0, NULL, 21),
    (N'dcb', 3, N'extra_cash', N'DCB Fidelity Z85193453', 14516.15, NULL, 22),
    (N'goel_dc', 2, N'loc_limit', N'Goel DC LOC limit', 200000, NULL, 30),
    (N'goel_dc', 2, N'loc_drawn', N'GOEL-DC LOC **0089', 0, NULL, 31),
    (N'g3', NULL, N'property_value', N'G3 property value (appraised)', 2500000, '2025-01-01', 40),
    (N'g3', NULL, N'mortgage', N'G3 Holdings Mortgage **0189', 322750, NULL, 41),
    (N'g3', NULL, N'mortgage', N'G3 Holdings Mortgage **0070', 1893437, NULL, 42),
    (N'g3', NULL, N'extra_cash', N'G3 Fidelity Z85193488', 60916.28, NULL, 43);
END
