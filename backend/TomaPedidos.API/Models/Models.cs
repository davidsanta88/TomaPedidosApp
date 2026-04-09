namespace TomaPedidos.API.Models
{
    public class Customer
    {
        public int f200_rowid { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string Nit { get; set; } = string.Empty;
        public string SucursalId { get; set; } = string.Empty;
        public string SucursalDescripcion { get; set; } = string.Empty;
    }

    public class Branch
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public string CustomerNit { get; set; } = string.Empty;
    }

    public class Item
    {
        public string ListaPrecioCliente { get; set; } = string.Empty;
        public int rowid_item { get; set; }
        public string f120_id { get; set; } = string.Empty;
        public string f120_descripcion { get; set; } = string.Empty;
        public decimal f126_precio { get; set; }
        public string f120_id_unidad_inventario { get; set; } = string.Empty;
        public decimal f122_factor { get; set; }
        public decimal f037_tasa { get; set; }
        public int f121_rowid { get; set; }
        public string f121_id_ext1_detalle { get; set; } = string.Empty;
        public decimal Existencia { get; set; }
        public decimal Comprometido { get; set; }
        public decimal Disponible { get; set; }
    }

    public class OrderHeader
    {
        public int? Id { get; set; }
        public string NitCliente { get; set; } = string.Empty;
        public string NombreCliente { get; set; } = string.Empty;
        public string SucursalId { get; set; } = string.Empty;
        public string SucursalNombre { get; set; } = string.Empty;
        public DateTime Fecha { get; set; }
        public decimal Subtotal { get; set; }
        public decimal Iva { get; set; }
        public decimal Total { get; set; }

        // Siesa Integration Fields
        public bool IntegradoSiesa { get; set; }
        public string? PedidoSiesa { get; set; }
        public DateTime? FechaIntegradoSiesa { get; set; }
        public string? RespuestaSiesa { get; set; }
    }

    public class OrderDetail
    {
        public int Id { get; set; }
        public int OrdenId { get; set; }
        public string CodigoItem { get; set; } = string.Empty;
        public string DescripcionItem { get; set; } = string.Empty;
        public int ExtensionId { get; set; }
        public string ExtensionDetalle { get; set; } = string.Empty;
        public int Cantidad { get; set; }
        public decimal Precio { get; set; }
        public decimal TasaIva { get; set; }
    }

    public class ObjLogSiesa
    {
        public string? Referencia { get; set; }
        public string? Proceso { get; set; }
        public string? Conector { get; set; }
        public string? Parametros { get; set; }
        public int IdConector { get; set; }
        public string? XML { get; set; }
        public string? Respuesta { get; set; }
    }

    public class OrderRequest
    {
        public OrderHeader Header { get; set; } = new();
        public List<OrderDetail> Details { get; set; } = new();
    }
}
