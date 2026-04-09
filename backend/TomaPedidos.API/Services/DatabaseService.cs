using Dapper;
using Microsoft.Data.SqlClient;
using System.Data;
using System.Collections.Generic;
using System.Threading.Tasks;
using TomaPedidos.API.Models;
using Microsoft.Extensions.Configuration;

namespace TomaPedidos.API.Services
{
    public interface IDatabaseService
    {
        Task<IEnumerable<T>> QueryAsync<T>(string spName, object? parameters = null);
        Task<IEnumerable<T>> QueryRawAsync<T>(string sql, object? parameters = null);
        Task<T?> QueryFirstOrDefaultAsync<T>(string spName, object? parameters = null);
        Task<T?> QueryFirstOrDefaultRawAsync<T>(string sql, object? parameters = null);
        Task<int> ExecuteAsync(string spName, object? parameters = null);
        Task InitializeDatabaseAsync();
        Task InitializeStoredProceduresAsync();
        Task<int> SaveOrderAsync(OrderHeader header, List<OrderDetail> details);
    }

    public class DatabaseService : IDatabaseService
    {
        private readonly string _connectionString;

        public DatabaseService(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection") 
                ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");
        }

        public async Task InitializeDatabaseAsync()
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var createTableSql = @"
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'tbl_tmp_pedido_encabezado')
                BEGIN
                    CREATE TABLE tbl_tmp_pedido_encabezado (
                        Id INT PRIMARY KEY IDENTITY(1,1),
                        NitCliente NVARCHAR(50),
                        NombreCliente NVARCHAR(255),
                        SucursalId NVARCHAR(50),
                        SucursalNombre NVARCHAR(255),
                        Fecha DATETIME DEFAULT GETDATE(),
                        Subtotal DECIMAL(18,2),
                        Iva DECIMAL(18,2),
                        Total DECIMAL(18,2),
                        FechaRegistro DATETIME,
                        IntegradoSiesa BIT,
                        PedidoSiesa NVARCHAR(50),
                        FechaIntegradoSiesa DATETIME,
                        RespuestaSiesa NVARCHAR(MAX)
                    );
                END

                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'tbl_tmp_pedido_detalle')
                BEGIN
                    CREATE TABLE tbl_tmp_pedido_detalle (
                        Id INT PRIMARY KEY IDENTITY(1,1),
                        OrdenId INT NOT NULL,
                        CodigoItem NVARCHAR(50),
                        DescripcionItem NVARCHAR(255),
                        ExtensionId INT,
                        ExtensionDetalle NVARCHAR(255),
                        Cantidad INT,
                        Precio DECIMAL(18,2),
                        TasaIva DECIMAL(18,2),
                        CONSTRAINT FK_Orden_Detalle FOREIGN KEY (OrdenId) REFERENCES tbl_tmp_pedido_encabezado(Id)
                    );
                END
                ELSE
                BEGIN
                    -- Migration: Rename VarianteId to ExtensionId if it exists
                    IF EXISTS (SELECT * FROM sys.columns WHERE Name = 'VarianteId' AND Object_ID = OBJECT_ID('tbl_tmp_pedido_detalle'))
                    BEGIN
                        EXEC sp_rename 'tbl_tmp_pedido_detalle.VarianteId', 'ExtensionId', 'COLUMN';
                    END
                END
            ";

            await connection.ExecuteAsync(createTableSql);
        }

        public async Task<int> SaveOrderAsync(OrderHeader header, List<OrderDetail> details)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            using var transaction = connection.BeginTransaction();

            try
            {
                var headerSql = @"
                    INSERT INTO tbl_tmp_pedido_encabezado (NitCliente, NombreCliente, SucursalId, SucursalNombre, Subtotal, Iva, Total, FechaRegistro, IntegradoSiesa)
                    VALUES (@NitCliente, @NombreCliente, @SucursalId, @SucursalNombre, @Subtotal, @Iva, @Total, GETDATE(), 0);
                    SELECT CAST(SCOPE_IDENTITY() as int);";

                var orderId = await connection.QuerySingleAsync<int>(headerSql, header, transaction);

                var detailSql = @"
                    INSERT INTO tbl_tmp_pedido_detalle (OrdenId, CodigoItem, DescripcionItem, ExtensionId, ExtensionDetalle, Cantidad, Precio, TasaIva)
                    VALUES (@OrdenId, @CodigoItem, @DescripcionItem, @ExtensionId, @ExtensionDetalle, @Cantidad, @Precio, @TasaIva);";

                foreach (var detail in details)
                {
                    detail.OrdenId = orderId;
                    await connection.ExecuteAsync(detailSql, detail, transaction);
                }

                transaction.Commit();
                return orderId;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        public async Task InitializeStoredProceduresAsync()
        {
            var spPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "update_sp.sql");
            if (!File.Exists(spPath)) return;

            var script = await File.ReadAllTextAsync(spPath);
            var commands = script.Split(new[] { "GO", "go", "Go", "gO" }, StringSplitOptions.RemoveEmptyEntries);

            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            foreach (var command in commands)
            {
                var cleanCommand = command.Trim();
                if (string.IsNullOrWhiteSpace(cleanCommand) || cleanCommand.StartsWith("USE", StringComparison.OrdinalIgnoreCase)) 
                    continue;

                try
                {
                    await connection.ExecuteAsync(cleanCommand);
                    Console.WriteLine($"[SP Sync] Successfully executed command starting with: {cleanCommand.Substring(0, Math.Min(30, cleanCommand.Length))}...");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SP Sync Error] Failed to execute command. Error: {ex.Message}\nStack: {ex.StackTrace}");
                }
            }
        }

        public async Task<IEnumerable<T>> QueryAsync<T>(string spName, object? parameters = null)
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryAsync<T>(spName, parameters, commandType: CommandType.StoredProcedure);
        }

        public async Task<IEnumerable<T>> QueryRawAsync<T>(string sql, object? parameters = null)
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryAsync<T>(sql, parameters, commandType: CommandType.Text);
        }

        public async Task<T?> QueryFirstOrDefaultAsync<T>(string spName, object? parameters = null)
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryFirstOrDefaultAsync<T>(spName, parameters, commandType: CommandType.StoredProcedure);
        }

        public async Task<T?> QueryFirstOrDefaultRawAsync<T>(string sql, object? parameters = null)
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryFirstOrDefaultAsync<T>(sql, parameters, commandType: CommandType.Text);
        }

        public async Task<int> ExecuteAsync(string spName, object? parameters = null)
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.ExecuteAsync(spName, parameters, commandType: CommandType.StoredProcedure);
        }
    }
}
