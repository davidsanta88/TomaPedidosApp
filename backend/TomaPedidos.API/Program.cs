using System;
using TomaPedidos.API.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddOpenApi();

// Register Database Services
builder.Services.AddScoped<IDatabaseService, DatabaseService>();
builder.Services.AddScoped<IShoppingCartService, ShoppingCartService>();

// Configure CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Initialize Database
try
{
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<IDatabaseService>();
        await db.InitializeDatabaseAsync();
        // await db.InitializeStoredProceduresAsync();
    }
}
catch (Exception ex)
{
    Console.WriteLine($"Warning: Database initialization failed: {ex.Message}");
}

app.UseHttpsRedirection();

app.UseCors("AllowAll");

app.UseAuthorization();

app.MapControllers();

app.Run();

