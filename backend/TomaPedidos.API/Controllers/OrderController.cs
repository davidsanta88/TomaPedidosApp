using Microsoft.AspNetCore.Mvc;
using TomaPedidos.API.Models;
using TomaPedidos.API.Services;
using System.Linq;
using System.Data;
using System;
using System.Threading.Tasks;

namespace TomaPedidos.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class OrderController : ControllerBase
    {
        private readonly IDatabaseService _db;
        private readonly IShoppingCartService _shopingCartService;

        public OrderController(IDatabaseService db, IShoppingCartService shoppingCartService)
        {
            _db = db;
            _shopingCartService = shoppingCartService;
        }

        [HttpPost]
        public async Task<IActionResult> CreateOrder([FromBody] OrderRequest request)
        {
            if (request == null || request.Header == null || request.Details == null || !request.Details.Any())
            {
                return BadRequest("Datos de pedido inválidos");
            }

            try
            {
                var orderId = await _db.SaveOrderAsync(request.Header, request.Details);
                request.Header.Id = orderId;

                var pedido = request.Header;
                Guid uuid = Guid.NewGuid();

                if (pedido.Id.HasValue)
                {
                    ObjLogSiesa objLogSiesa = new ObjLogSiesa
                    {
                        Referencia = uuid.ToString(),
                        Proceso = "Cargar Documento- DocumetosV5",
                        Conector = "DocumentosV5",
                        Parametros = "@UUID" + uuid.ToString()
                    };

                    string XML = "";
                    string respuesta = "";

                    // Obtenemos los DataSets para la integración con Siesa
                    DataSet dsPedido = _shopingCartService.ConetorPedido(orderId.ToString());
                    DataSet dsMvtoPedido = _shopingCartService.ConetorMvtoPedido(orderId.ToString());

                    if (dsPedido.Tables.Count > 0 && dsPedido.Tables[0].Rows.Count > 0 &&
                        dsMvtoPedido.Tables.Count > 0 && dsMvtoPedido.Tables[0].Rows.Count > 0)
                    {
                        XML = "<MyDataSet>" + Environment.NewLine;

                        foreach (DataRow fila in dsPedido.Tables[0].Rows)
                        {
                            XML += "<Pedido_Docto_V5>" + Environment.NewLine;
                            foreach (DataColumn columna in dsPedido.Tables[0].Columns)
                            {
                                XML += $"<{columna.ColumnName}>{fila[columna]}</{columna.ColumnName}>" + Environment.NewLine;
                            }
                            XML += "</Pedido_Docto_V5>" + Environment.NewLine;
                        }

                        foreach (DataRow fila in dsMvtoPedido.Tables[0].Rows)
                        {
                            XML += "<Pedido_Mvto_V5>" + Environment.NewLine;
                            foreach (DataColumn columna in dsMvtoPedido.Tables[0].Columns)
                            {
                                XML += $"<{columna.ColumnName}>{fila[columna]}</{columna.ColumnName}>" + Environment.NewLine;
                            }
                            XML += "</Pedido_Mvto_V5>" + Environment.NewLine;
                        }

                        XML += "</MyDataSet>" + Environment.NewLine;
                        XML = XML.Replace(",", ".");
                        objLogSiesa.IdConector = 1;
                        objLogSiesa.XML = XML;
                        
                        ImportarConectorSiesa importar = new ImportarConectorSiesa(_shopingCartService); 
                        respuesta = await importar.Consumo_Selene_Generar_Plano(objLogSiesa);
                        objLogSiesa.Respuesta = respuesta;

                        // Validar si el pedido quedó importado en Siesa
                        DataSet dsValidacion = _shopingCartService.ValidarPedidoExiste(pedido.Id.Value.ToString());
                        bool importadoSiesa = dsValidacion.Tables.Count > 0 && dsValidacion.Tables[0].Rows.Count > 0;

                        if (importadoSiesa)
                        {
                            string consecutivoSiesa = dsValidacion.Tables[0].Rows[0]["consecutivo"]?.ToString() ?? "";
                            await _shopingCartService.ActualizarIntegradoAsync(pedido.Id.Value, consecutivoSiesa);
                            
                            pedido.IntegradoSiesa = true;
                            pedido.PedidoSiesa = consecutivoSiesa;
                            pedido.FechaIntegradoSiesa = DateTime.Now;
                            pedido.RespuestaSiesa = objLogSiesa.Respuesta;
                        }

                        return Ok(new
                        {
                            mensaje = importadoSiesa
                                ? "Proceso realizado correctamente, pedido importado a Siesa. "
                                : "El pedido fue procesado pero no se confirmó la importación en Siesa. ",
                            importadoSiesa,
                            respuestaSiesa = objLogSiesa.Respuesta,
                            pedido
                        });
                    }
                    else
                    {
                        return Ok(new { 
                            mensaje = "Los procedimientos almacenados no retornan informacion para la integración.",
                            OrderId = orderId 
                        });
                    }
                }

                return Ok(new { OrderId = orderId, Message = "Pedido guardado exitosamente (Sin integración)" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error interno al guardar o integrar el pedido", detail = ex.Message });
            }
        }
    }
}
