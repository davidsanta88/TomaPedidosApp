using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Dapper;

namespace TomaPedidos.API.Services
{
    public interface IShoppingCartService
    {
        DataSet ConetorPedido(string uuid);
        DataSet ConetorMvtoPedido(string uuid);
        DataSet ValidarPedidoExiste(string orderId);
        Task ActualizarIntegradoAsync(int orderId, string consecutivo);
    }

    public class ShoppingCartService : IShoppingCartService
    {
        private readonly string _connectionString;

        public ShoppingCartService(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection") 
                ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");
        }

        public DataSet ConetorPedido(string uuid)
        {
            return ExecuteStoredProcedure("sp_tmp_pedido_seccion_documento", new { OrdenId = uuid });
        }

        public DataSet ConetorMvtoPedido(string uuid)
        {
            return ExecuteStoredProcedure("sp_tmp_pedido_seccion_movimiento", new { OrdenId = uuid });
        }

        public DataSet ValidarPedidoExiste(string orderId)
        {
            return ExecuteStoredProcedure("sp_tmp_pedido_validar_siesa", new { OrdenId = orderId });
        }

        public async Task ActualizarIntegradoAsync(int orderId, string consecutivo)
        {
            using var connection = new SqlConnection(_connectionString);
            string sql = "UPDATE tbl_tmp_pedido_encabezado SET IntegradoSiesa = 1, PedidoSiesa = @Consecutivo, FechaIntegradoSiesa = GETDATE() WHERE Id = @Id";
            await connection.ExecuteAsync(sql, new { Id = orderId, Consecutivo = consecutivo });
        }

        private DataSet ExecuteStoredProcedure(string spName, object parameters)
        {
            var ds = new DataSet();
            using var connection = new SqlConnection(_connectionString);
            using var command = new SqlCommand(spName, connection);
            command.CommandType = CommandType.StoredProcedure;

            if (parameters != null)
            {
                foreach (var prop in parameters.GetType().GetProperties())
                {
                    command.Parameters.AddWithValue("@" + prop.Name, prop.GetValue(parameters) ?? DBNull.Value);
                }
            }

            var adapter = new SqlDataAdapter(command);
            adapter.Fill(ds);
            return ds;
        }
    }
}
