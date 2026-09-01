-- List tab: System (AL) + Category (AM) + HVAC_Systems_-_Abbreviations (AN) + unit (AO).
-- Abbreviation column holds HVAC + Plumbing + Duct codes, not HVAC-only.
-- Kind matches spec sheet: hydronic (HVAC Pipe) | plumbing | duct.
-- Idempotent. Spec lines store names as strings — no FK.

IF COL_LENGTH('dbo.Bid_SpecSystems', 'Kind') IS NULL
BEGIN
  ALTER TABLE dbo.Bid_SpecSystems ADD Kind nvarchar(20) NOT NULL
    CONSTRAINT DF_Bid_SpecSystems_Kind DEFAULT N'hydronic';
END
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Bid_SpecSystems_Name' AND object_id = OBJECT_ID('dbo.Bid_SpecSystems'))
  DROP INDEX UX_Bid_SpecSystems_Name ON dbo.Bid_SpecSystems;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Bid_SpecSystems_Kind_Name' AND object_id = OBJECT_ID('dbo.Bid_SpecSystems'))
  CREATE UNIQUE INDEX UX_Bid_SpecSystems_Kind_Name ON dbo.Bid_SpecSystems(Kind, SystemName);
GO

DELETE FROM dbo.Bid_SpecSystems;
GO

SET IDENTITY_INSERT dbo.Bid_SpecSystems OFF;
INSERT INTO dbo.Bid_SpecSystems (SystemName, Code, Unit, Kind, SortOrder)
VALUES
  (N'AC Condensate', N'ACD', N'LF', N'hydronic', 0),
  (N'Advanced Plant Water', N'APW', N'LF', N'hydronic', 1),
  (N'Boiler Feed Water', N'BFW', N'LF', N'hydronic', 2),
  (N'Breeching', N'BRE', N'LF', N'hydronic', 3),
  (N'Combustion Air', N'CA', N'LF', N'hydronic', 4),
  (N'Continuous Blowdown', N'CBD', N'LF', N'hydronic', 5),
  (N'Chilled Beam', N'CHB', N'LF', N'hydronic', 6),
  (N'Chilled Water', N'CHW', N'LF', N'hydronic', 7),
  (N'Condensor Water', N'CON', N'LF', N'hydronic', 8),
  (N'Dual Temp Piping', N'DTP', N'LF', N'hydronic', 9),
  (N'Fuel Oil Piping', N'FOL', N'LF', N'hydronic', 10),
  (N'Geothermal Piping', N'GEO', N'LF', N'hydronic', 11),
  (N'Generator Exhaust', N'GEX', N'LF', N'hydronic', 12),
  (N'Glycol Piping', N'GLY', N'LF', N'hydronic', 13),
  (N'High Pressure Steam', N'HPS', N'LF', N'hydronic', 14),
  (N'Medium Pressure Steam', N'MPS', N'LF', N'hydronic', 15),
  (N'Low Pressure Steam', N'LPS', N'LF', N'hydronic', 16),
  (N'Steam Condensate', N'SCD', N'LF', N'hydronic', 17),
  (N'High Temp Steam Condensate', N'HSC', N'LF', N'hydronic', 18),
  (N'Medium Temp Steam Condensate', N'MSC', N'LF', N'hydronic', 19),
  (N'Low Temp Steam Condensate', N'LSC', N'LF', N'hydronic', 20),
  (N'Heat Recovery', N'HRE', N'LF', N'hydronic', 21),
  (N'Heat Traced Piping', N'HTP', N'LF', N'hydronic', 22),
  (N'Hot Water Heating', N'HWH', N'LF', N'hydronic', 23),
  (N'Pumped Condensate', N'PC', N'LF', N'hydronic', 24),
  (N'Primary Chilled Water', N'PCH', N'LF', N'hydronic', 25),
  (N'Process Cooling Water', N'PCW', N'LF', N'hydronic', 26),
  (N'Refrigerant', N'REF', N'LF', N'hydronic', 27),
  (N'Refrigerant Liquid', N'RL', N'LF', N'hydronic', 28),
  (N'Refrigerant Suction', N'RS', N'LF', N'hydronic', 29),
  (N'Refrigerant Gas', N'RG', N'LF', N'hydronic', 30),
  (N'Secondary Chilled Water', N'SCH', N'LF', N'hydronic', 31),
  (N'Steam Vent', N'STV', N'LF', N'hydronic', 32),
  (N'AC Condensate', N'ACD', N'LF', N'plumbing', 33),
  (N'Domestic Cold Water', N'DCW', N'LF', N'plumbing', 34),
  (N'Domestic Hot Water', N'DHW', N'LF', N'plumbing', 35),
  (N'Compressed Air', N'CA', N'LF', N'plumbing', 36),
  (N'Clear Water Waste', N'CWW', N'LF', N'plumbing', 37),
  (N'Fuel Oil Pipe', N'FOL', N'LF', N'plumbing', 38),
  (N'Fire Water Line Overheat', N'OHF', N'LF', N'plumbing', 39),
  (N'Fire Line Heat Traced', N'FOL', N'LF', N'plumbing', 40),
  (N'Domestic Water Line Overheat', N'OHW', N'LF', N'plumbing', 41),
  (N'Garage Drain', N'GD', N'LF', N'plumbing', 42),
  (N'High Purity Water', N'HPW', N'LF', N'plumbing', 43),
  (N'Heat Traced Piping', N'HTP', N'LF', N'plumbing', 44),
  (N'Laboratory Air', N'LA', N'LF', N'plumbing', 45),
  (N'Laboratory Domestic Cold Water', N'LDC', N'LF', N'plumbing', 46),
  (N'Laboratory Domestic Hot Water', N'LDH', N'LF', N'plumbing', 47),
  (N'Make up Water', N'MUW', N'LF', N'plumbing', 48),
  (N'Non Potable Water', N'NPW', N'LF', N'plumbing', 49),
  (N'Pumped Condensate', N'PC', N'LF', N'plumbing', 50),
  (N'P - Traps', N'PTR', N'LF', N'plumbing', 51),
  (N'Roof Drain', N'RFD', N'LF', N'plumbing', 52),
  (N'Reverse Osmosis', N'RO', N'LF', N'plumbing', 53),
  (N'Sanitary Waste', N'SAN', N'LF', N'plumbing', 54),
  (N'Tempered Water', N'TEM', N'LF', N'plumbing', 55),
  (N'Vent', N'VNT', N'LF', N'plumbing', 56),
  (N'Vertical Storm Drain', N'VRD', N'LF', N'plumbing', 57),
  (N'Secondary Storm', N'SST', N'LF', N'plumbing', 58),
  (N'Horizontal Storm Drain', N'HRD', N'LF', N'plumbing', 59),
  (N'Storm', N'ST', N'LF', N'plumbing', 60),
  (N'Overflow Storm', N'OFS', N'LF', N'plumbing', 61),
  (N'Rain Harvest', N'', N'LF', N'plumbing', 62),
  (N'Medium Pressure Supply Air', N'MSA', N'LF', N'duct', 63),
  (N'Low Pressure Supply Air', N'LSA', N'LF', N'duct', 64),
  (N'Return Air', N'RET', N'LF', N'duct', 65),
  (N'Exhaust Air', N'EXH', N'SF', N'duct', 66),
  (N'Outside Air', N'OSA', N'SF', N'duct', 67),
  (N'Heat Recovery Exhaust', N'HRE', N'SF', N'duct', 68),
  (N'Heat Recovery Return', N'HRR', N'SF', N'duct', 69),
  (N'Kitchen Hood Exhaust', N'KHE', N'SF', N'duct', 70),
  (N'Fire Rated Duct', N'FRD', N'SF', N'duct', 71),
  (N'Stairwell Pressurization', N'STP', N'SF', N'duct', 72),
  (N'DOAS Supply', N'DOA', N'SF', N'duct', 73),
  (N'DOAS Return', N'DOR', N'SF', N'duct', 74),
  (N'Energy Recovery Return', N'ERR', N'SF', N'duct', 75),
  (N'Energy Recovery Supply', N'ERS', N'SF', N'duct', 76),
  (N'Dish Washer Exhaust', N'DWE', N'SF', N'duct', 77),
  (N'Make Up Air', N'MUA', N'SF', N'duct', 78),
  (N'Make up Return Air', N'MAR', N'SF', N'duct', 79),
  (N'Mixed Air', N'MXA', N'SF', N'duct', 80),
  (N'Relief Air', N'REL', N'SF', N'duct', 81),
  (N'Transfer Air', N'TRA', N'SF', N'duct', 82);
GO
