using System;
using System.Threading.Tasks;
using TomaPedidos.API.Models;

namespace TomaPedidos.API.Services
{
    public class ImportarConectorSiesa
    {
        private readonly IShoppingCartService _shopingCartService;

        public ImportarConectorSiesa(IShoppingCartService shopingCartService)
        {
            _shopingCartService = shopingCartService;
        }

        /// <summary>
        /// Consumo del webservice de Siesa para generar el plano del pedido.
        /// Este es un método placeholder que simula la comunicación con el conector de Siesa.
        /// </summary>
        public async Task<string> Consumo_Selene_Generar_Plano(ObjLogSiesa objLogSiesa)
        {
            // Aquí iría la lógica real de comunicación con el WebService (SOAP/REST) de Siesa.
            // Por ahora, simulamos un éxito para permitir que el flujo continúe.
            
            await Task.Delay(500); // Simulando latencia de red
            
            if (string.IsNullOrEmpty(objLogSiesa.XML))
            {
                return "Error: XML vacío";
            }

            return "exito"; 
        }
    }
}
