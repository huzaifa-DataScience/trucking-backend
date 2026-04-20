-- Drop only — all dbo.Clearstory_* mirror tables (same list as the top of clearstory-all-tables.sql).
-- Use when you want to remove tables without recreating yet. Otherwise run clearstory-all-tables.sql alone (drop + create).
-- Destructive. Requires SQL Server 2016+ (DROP TABLE IF EXISTS). Use the correct database context.

SET NOCOUNT ON;

DROP TABLE IF EXISTS dbo.Clearstory_ApiPayloads;
DROP TABLE IF EXISTS dbo.Clearstory_SyncSnapshots;
DROP TABLE IF EXISTS dbo.Clearstory_ProjectRates;
DROP TABLE IF EXISTS dbo.Clearstory_Rates;
DROP TABLE IF EXISTS dbo.Clearstory_Tags;
DROP TABLE IF EXISTS dbo.Clearstory_Cors;
DROP TABLE IF EXISTS dbo.Clearstory_ChangeNotificationContracts;
DROP TABLE IF EXISTS dbo.Clearstory_ChangeNotifications;
DROP TABLE IF EXISTS dbo.Clearstory_Projects;
DROP TABLE IF EXISTS dbo.Clearstory_CustomerOffices;
DROP TABLE IF EXISTS dbo.Clearstory_Customers;
DROP TABLE IF EXISTS dbo.Clearstory_Contracts;
DROP TABLE IF EXISTS dbo.Clearstory_Labels;
DROP TABLE IF EXISTS dbo.Clearstory_Divisions;
DROP TABLE IF EXISTS dbo.Clearstory_Offices;
DROP TABLE IF EXISTS dbo.Clearstory_Users;
DROP TABLE IF EXISTS dbo.Clearstory_Company;
DROP TABLE IF EXISTS dbo.Clearstory_SyncState;
GO
