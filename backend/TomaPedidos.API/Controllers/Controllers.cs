using Microsoft.AspNetCore.Mvc;
using TomaPedidos.API.Models;
using TomaPedidos.API.Services;
using System.Linq;

namespace TomaPedidos.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CustomerController : ControllerBase
    {
        private readonly IDatabaseService _db;

        public CustomerController(IDatabaseService db)
        {
            _db = db;
        }

        [HttpGet("search/{term}")]
        public async Task<IActionResult> Search(string term)
        {
            // Executing sp_tmp_clientes_obtener with @Cliente parameter (as seen in screenshot)
            // Returning all results to be displayed in a DataTable
            var customers = await _db.QueryAsync<Customer>("sp_tmp_clientes_obtener", new { Cliente = term });
            if (customers == null || !customers.Any()) return NotFound("No se encontraron clientes");
            return Ok(customers);
        }
    }

    [ApiController]
    [Route("api/[controller]")]
    public class BranchController : ControllerBase
    {
        private readonly IDatabaseService _db;

        public BranchController(IDatabaseService db)
        {
            _db = db;
        }

        [HttpGet("{nit}")]
        public async Task<IActionResult> GetBranches(string nit)
        {
            // Placeholder SP name: SP_GetBranchesByCustomer
            var branches = await _db.QueryAsync<Branch>("SP_GetBranchesByCustomer", new { Nit = nit });
            return Ok(branches);
        }
    }

    [ApiController]
    [Route("api/[controller]")]
    public class ItemController : ControllerBase
    {
        private readonly IDatabaseService _db;

        public ItemController(IDatabaseService db)
        {
            _db = db;
        }

        [HttpGet("{nit}/{sucursalId}")]
        public async Task<IActionResult> GetItems(string nit, string sucursalId)
        {
            try
            {
                var items = await _db.QueryAsync<Item>("sp_tmp_items_obtener", new { NitCliente = nit });
                return Ok(items);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message, detail = ex.InnerException?.Message });
            }
        }
    }
}
