import { useState, useEffect, useCallback } from 'react'
import './index.css'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

function App() {
  const [step, setStep] = useState(1); // 1: Search, 2: Branches, 3: Items
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectingId, setSelectingId] = useState(null);
  const [variantModalItem, setVariantModalItem] = useState(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', type: 'error' });

  const showToast = useCallback((title, message, type = 'error') => {
    setAlertModal({ isOpen: true, title, message, type });
  }, []);


  // Advanced Catalog States
  const [filters, setFilters] = useState({ id: '', descripcion: '' });
  const [customerFilters, setCustomerFilters] = useState({ nit: '', nombre: '', sucursal: '' });
  const [quantities, setQuantities] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;
  const [cart, setCart] = useState([]);

  const handleSearch = async () => {
    if (!searchTerm) return;
    setLoading(true);
    setCustomers([]);
    try {
      const response = await fetch(`http://localhost:5270/api/Customer/search/${searchTerm}`);
      if (!response.ok) {
        throw new Error('No se encontraron resultados');
      }
      const data = await response.json();
      setCustomers(data);
    } catch (error) {
      showToast('Error de Búsqueda', error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCustomer = async (customer) => {
    setSelectingId(customer.f200_rowid);
    setSelectedCustomer(customer);
    setSelectedBranch({
      id: customer.sucursalId,
      name: customer.sucursalDescripcion,
      address: ''
    });
    
    try {
      const response = await fetch(`http://localhost:5270/api/Item/${customer.nit}/${customer.sucursalId}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || errData?.message || 'No se pudieron cargar los productos');
      }
      const data = await response.json();
      setItems(data);
      setStep(3);
    } catch (error) {
      showToast('Error', `Error cargando productos: ${error.message}`, 'error');
    } finally {
      setSelectingId(null);
    }
  };

  const groupedItemsMap = items.reduce((acc, item) => {
    if (!acc[item.f120_id]) {
      acc[item.f120_id] = {
        f120_id: item.f120_id,
        f120_descripcion: item.f120_descripcion,
        f122_factor: item.f122_factor,
        f120_id_unidad_inventario: item.f120_id_unidad_inventario,
        variants: []
      };
    }
    acc[item.f120_id].variants.push(item);
    return acc;
  }, {});

  const groupedItems = Object.values(groupedItemsMap);

  const filteredItems = groupedItems
    .filter(group => 
      String(group.f120_id || '').toLowerCase().includes(filters.id.toLowerCase()) &&
      String(group.f120_descripcion || '').toLowerCase().includes(filters.descripcion.toLowerCase())
    )
    .sort((a, b) => {
      const descA = a.f120_descripcion || '';
      const descB = b.f120_descripcion || '';
      return descA.localeCompare(descB);
    });

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const pagedItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

  const handleAddToCart = (item) => {
    const qty = Math.max(1, parseInt(quantities[item.f121_rowid] || 1));

    setCart(prevCart => {
      const existing = prevCart.find(i => i.f121_rowid === item.f121_rowid);
      if (existing) {
        const newTotalQty = existing.quantity + qty;
        return prevCart.map(i => i.f121_rowid === item.f121_rowid ? { ...i, quantity: newTotalQty } : i);
      }
      return [...prevCart, { ...item, quantity: qty }];
    });
    
    setQuantities(prev => ({ ...prev, [item.f121_rowid]: 1 }));
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.f126_precio * item.quantity), 0);
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const filteredCustomers = customers
    .filter(c => 
      (c.nit || '').toLowerCase().includes(customerFilters.nit.toLowerCase()) &&
      (c.nombre || '').toLowerCase().includes(customerFilters.nombre.toLowerCase()) &&
      (`${c.sucursalId} ${c.sucursalDescripcion}` || '').toLowerCase().includes(customerFilters.sucursal.toLowerCase())
    )
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  const reset = () => {
    setStep(1);
    setSearchTerm('');
    setFilters({ id: '', descripcion: '' });
    setCustomerFilters({ nit: '', nombre: '', sucursal: '' });
    setCurrentPage(1);
    setCustomers([]);
    setItems([]);
    setCart([]);
    setSelectedCustomer(null);
    setSelectedBranch(null);
    setVariantModalItem(null);
  };

  const updateCartQuantity = (f121_rowid, newQty) => {
    const item = cart.find(i => i.f121_rowid === f121_rowid);
    if (item && newQty > item.disponible) {
      showToast('Cantidad Excedida', `La cantidad solicitada debe ser menor o igual a la disponible (${item.disponible})`, 'error');
      return;
    }

    if (newQty < 1) {
      setCart(prev => prev.filter(i => i.f121_rowid !== f121_rowid));
      return;
    }
    setCart(prev => prev.map(i => i.f121_rowid === f121_rowid ? { ...i, quantity: newQty } : i));
  };

  const exportCartToExcel = () => {
    if (cart.length === 0) return;
    const data = cart.map(item => ({
      'Código': item.f120_id,
      'Descripción': item.f120_descripcion + (item.f121_id_ext1_detalle ? ` [${item.f121_id_ext1_detalle}]` : ''),
      'Cant': item.quantity,
      'Disp': item.disponible,
      'Precio Unit': item.f126_precio,
      'IVA %': item.f037_tasa,
      'Total': item.quantity * item.f126_precio
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumen de Venta");
    XLSX.writeFile(wb, `Pedido_${selectedCustomer?.Nombre.replace(/\s+/g, '_')}_${new Date().toLocaleDateString()}.xlsx`);
  };

  const exportCartToPDF = () => {
    if (cart.length === 0) return;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Resumen de Venta', 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Cliente: ${selectedCustomer?.Nombre}`, 14, 30);
    doc.text(`NIT: ${selectedCustomer?.Nit}`, 14, 35);
    doc.text(`Fecha: ${new Date().toLocaleString('es-CO')}`, 14, 40);

    const tableData = cart.map(item => [
      item.f120_id,
      item.f120_descripcion + (item.f121_id_ext1_detalle ? ` [${item.f121_id_ext1_detalle}]` : ''),
      item.quantity,
      item.disponible?.toLocaleString('es-CO') || '0',
      `$${item.f126_precio.toLocaleString('es-CO')}`,
      `${item.f037_tasa}%`,
      `$${(item.quantity * item.f126_precio).toLocaleString('es-CO')}`
    ]);

    autoTable(doc, {
      startY: 45,
      head: [['Código', 'Descripción', 'Cant', 'Disp', 'Precio', 'IVA', 'Subtotal']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillStyle: 'var(--primary)', fillColor: [230, 0, 0] }
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    const totalIva = cart.reduce((acc, i) => acc + (i.f126_precio * i.quantity * (i.f037_tasa/100)), 0);
    const totalVenta = cartTotal + totalIva;

    doc.text(`Subtotal: $${cartTotal.toLocaleString('es-CO')}`, 140, finalY);
    doc.text(`IVA: $${totalIva.toLocaleString('es-CO')}`, 140, finalY + 5);
    doc.setFontSize(12);
    doc.text(`TOTAL: $${totalVenta.toLocaleString('es-CO')}`, 140, finalY + 12);

    doc.save(`Pedido_${selectedCustomer?.Nombre.replace(/\s+/g, '_')}.pdf`);
  };

  const exportCatalogToExcel = () => {
    const data = items.map(item => ({
      'Código': item.f120_id,
      'Descripción': item.f120_descripcion,
      'Unid': item.f120_id_unidad_inventario,
      'Fact': item.f122_factor,
      'Exist': item.existencia,
      'Compr': item.comprometido,
      'Disp': item.disponible,
      'Precio': item.f126_precio,
      'IVA %': item.f037_tasa
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Portafolio");
    XLSX.writeFile(wb, `Portafolio_${new Date().toLocaleDateString()}.xlsx`);
  };

  const exportCatalogToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Portafolio de Productos', 14, 20);
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date().toLocaleString('es-CO')}`, 14, 28);

    const tableData = items.map(item => [
      item.f120_id,
      item.f120_descripcion,
      item.f120_id_unidad_inventario,
      item.f122_factor,
      item.existencia?.toLocaleString('es-CO') || '0',
      item.comprometido?.toLocaleString('es-CO') || '0',
      item.disponible?.toLocaleString('es-CO') || '0',
      `$${item.f126_precio.toLocaleString('es-CO')}`,
      `${item.f037_tasa}%`
    ]);

    autoTable(doc, {
      startY: 35,
      head: [['Cod', 'Descripción', 'Und', 'Fact', 'Exist', 'Compr', 'Disp', 'Precio', 'IVA']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [50, 50, 50] }
    });

    doc.save('Portafolio_Productos.pdf');
  };

  const handleConfirmOrder = async () => {
    if (cart.length === 0) return;
    
    setLoading(true);
    const subtotal = cartTotal;
    const iva = cart.reduce((acc, i) => acc + (i.f126_precio * i.quantity * (i.f037_tasa/100)), 0);
    const total = subtotal + iva;

    const orderRequest = {
      header: {
        nitCliente: selectedCustomer.nit,
        nombreCliente: selectedCustomer.nombre,
        sucursalId: selectedBranch.id,
        sucursalNombre: selectedBranch.name,
        subtotal: subtotal,
        iva: iva,
        total: total
      },
      details: cart.map(item => ({
        codigoItem: item.f120_id,
        descripcionItem: item.f120_descripcion,
        extensionId: item.f121_rowid,
        extensionDetalle: item.f121_id_ext1_detalle || 'ESTÁNDAR',
        cantidad: item.quantity,
        precio: item.f126_precio,
        tasaIva: item.f037_tasa
      }))
    };

    try {
      const response = await fetch('http://localhost:5270/api/Order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderRequest)
      });

      if (!response.ok) {
        throw new Error('Error al guardar el pedido');
      }

      const result = await response.json();
      showToast('Éxito', `¡Pedido guardado con éxito! ID: ${result.orderId}`, 'success');
      reset();
    } catch (error) {
      showToast('Error', error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      {/* Alert Modal Container */}
      {alertModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '400px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            animation: 'slideUp 0.3s ease-out'
          }}>
            <div style={{
              padding: '15px 20px',
              borderBottom: '1px solid #eee',
              background: alertModal.type === 'error' ? '#fff1f0' : alertModal.type === 'success' ? '#f6ffed' : '#e6f7ff',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{fontSize: '20px'}}>
                {alertModal.type === 'error' ? '⚠️' : alertModal.type === 'success' ? '✅' : 'ℹ️'}
              </span>
              <h3 style={{
                margin: 0, 
                color: alertModal.type === 'error' ? '#cf1322' : alertModal.type === 'success' ? '#389e0d' : '#096dd9',
                fontSize: '16px'
              }}>{alertModal.title}</h3>
            </div>
            <div style={{padding: '20px', fontSize: '14px', color: '#444', lineHeight: '1.5'}}>
              {alertModal.message}
            </div>
            <div style={{padding: '15px 20px', background: '#f9f9f9', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #eee'}}>
              <button 
                className="btn btn-primary"
                style={{
                  background: alertModal.type === 'error' ? '#cf1322' : alertModal.type === 'success' ? '#389e0d' : '#096dd9',
                  padding: '8px 25px'
                }}
                onClick={() => setAlertModal({ ...alertModal, isOpen: false })}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="title" style={{padding: '10px 0', marginBottom: '10px'}}>
        <h1 style={{color: 'var(--primary)', fontWeight: '900', fontSize: '1.8rem', letterSpacing: '-1px'}}>TOMAPEDIDOS VADISA</h1>
      </header>

      {/* Loading Modal Overlay */}
      {selectingId !== null && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="card animate-fade-in" style={{
            textAlign: 'center',
            padding: '40px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <div className="spinner" style={{
              width: '50px',
              height: '50px',
              border: '5px solid #f3f3f3',
              borderTop: '5px solid var(--primary)',
              borderRadius: '50%',
              margin: '0 auto 20px',
              animation: 'spin 1s linear infinite'
            }}></div>
            <h3 style={{color: 'var(--primary)', marginBottom: '10px'}}>Procesando información</h3>
            <p style={{color: '#666'}}>Por favor espere un momento...</p>
          </div>
        </div>
      )}

      {/* Variant Selection Modal */}
      {variantModalItem && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 8000,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="card animate-fade-in" style={{
            maxWidth: '800px',
            width: '95%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '2px solid #eee', paddingBottom: '10px'}}>
              <div>
                <h2 style={{color: 'var(--primary)'}}>{variantModalItem.f120_descripcion}</h2>
                <div style={{fontSize: '13px', color: '#666'}}>Ref: {variantModalItem.f120_id} | {variantModalItem.variants.length} Extensiones disponibles</div>
              </div>
              <button onClick={() => setVariantModalItem(null)} style={{background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999'}}>&times;</button>
            </div>

            <div style={{overflowY: 'auto', flex: 1}}>
              <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left'}}>
                <thead>
                  <tr style={{background: '#f8f9fa'}}>
                    <th style={{padding: '10px'}}>Extensión / Detalle</th>
                    <th style={{padding: '10px', textAlign: 'right', fontSize: '11px', color: '#17a2b8', fontWeight: 'bold'}}>Exist.</th>
                    <th style={{padding: '10px', textAlign: 'right', fontSize: '11px', color: '#dc3545'}}>Compr.</th>
                    <th style={{padding: '10px', textAlign: 'right', fontSize: '11px', color: '#28a745', fontWeight: 'bold'}}>Disp.</th>
                    <th style={{padding: '10px', textAlign: 'right'}}>Precio</th>
                    <th style={{padding: '10px', textAlign: 'center'}}>IVA</th>
                    <th style={{padding: '10px', textAlign: 'center', width: '80px'}}>Cant.</th>
                    <th style={{padding: '10px', textAlign: 'center'}}>Añadir</th>
                  </tr>
                </thead>
                <tbody>
                  {variantModalItem.variants.map((v) => (
                    <tr key={v.rowid_item} style={{borderBottom: '1px solid #eee'}}>
                      <td style={{padding: '10px', fontWeight: '500'}}>{v.f121_id_ext1_detalle || 'ESTÁNDAR'}</td>
                      <td style={{padding: '10px', textAlign: 'right', fontSize: '11px', color: '#17a2b8', fontWeight: 'bold'}}>{v.existencia?.toLocaleString('es-CO') ?? '0'}</td>
                      <td style={{padding: '10px', textAlign: 'right', fontSize: '11px', color: '#dc3545'}}>{v.comprometido?.toLocaleString('es-CO') ?? '0'}</td>
                      <td style={{padding: '10px', textAlign: 'right', fontSize: '11px', color: '#28a745', fontWeight: 'bold'}}>{v.disponible?.toLocaleString('es-CO') ?? '0'}</td>
                      <td style={{padding: '10px', textAlign: 'right'}}>${v.f126_precio.toLocaleString('es-CO')}</td>
                      <td style={{padding: '10px', textAlign: 'center'}}>{v.f037_tasa}%</td>
                      <td style={{padding: '10px'}}>
                        <input 
                          type="number" 
                          className="input" 
                          style={{padding: '3px', textAlign: 'center', width: '100%'}}
                          value={quantities[v.f121_rowid] || '1'}
                          min="1"
                          onChange={(e) => setQuantities({ ...quantities, [v.f121_rowid]: Math.max(1, parseInt(e.target.value) || 1) })}
                        />
                      </td>
                      <td style={{padding: '10px', textAlign: 'center'}}>
                        <button className="btn btn-primary" style={{padding: '5px 12px', fontSize: '12px'}} onClick={() => handleAddToCart(v)}>
                          + Carrito
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px', textAlign: 'right'}}>
              <button className="btn btn-primary" style={{background: 'var(--secondary)'}} onClick={() => setVariantModalItem(null)}>
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Customer Search */}
      {step === 1 && (
        <div className="animate-fade-in">
          <div className="card">
            <h2 style={{marginBottom: '15px'}}>Búsqueda de Cliente</h2>
            <div style={{display: 'flex', gap: '10px'}}>
              <input 
                type="text" 
                className="input" 
                placeholder="Nombre o NIT..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button className="btn btn-primary" onClick={handleSearch} disabled={loading}>
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>

          {customers.length > 0 && (
            <div className="card animate-fade-in" style={{marginTop: '20px', padding: '10px'}}>
              <div style={{overflowX: 'auto'}}>
                <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left'}}>
                  <thead>
                    <tr style={{background: '#f8f9fa', borderBottom: '2px solid #dee2e6'}}>
                      <th style={{padding: '12px'}}>
                        <div style={{fontSize: '11px', marginBottom: '5px'}}>NIT</div>
                        <input className="input" style={{padding: '4px', fontSize: '11px', width: '100%'}} placeholder="Filtrar..." value={customerFilters.nit} onChange={(e) => setCustomerFilters({...customerFilters, nit: e.target.value})} />
                      </th>
                      <th style={{padding: '12px'}}>
                        <div style={{fontSize: '11px', marginBottom: '5px'}}>Nombre / Razón Social</div>
                        <input className="input" style={{padding: '4px', fontSize: '11px', width: '100%'}} placeholder="Filtrar..." value={customerFilters.nombre} onChange={(e) => setCustomerFilters({...customerFilters, nombre: e.target.value})} />
                      </th>
                      <th style={{padding: '12px'}}>
                        <div style={{fontSize: '11px', marginBottom: '5px'}}>Sucursal</div>
                        <input className="input" style={{padding: '4px', fontSize: '11px', width: '100%'}} placeholder="Filtrar..." value={customerFilters.sucursal} onChange={(e) => setCustomerFilters({...customerFilters, sucursal: e.target.value})} />
                      </th>
                      <th style={{padding: '12px', textAlign: 'center'}}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((c, idx) => (
                      <tr key={idx} style={{borderBottom: '1px solid #eee'}} className="table-row">
                        <td style={{padding: '12px', fontSize: '14px'}}>{c.nit}</td>
                        <td style={{padding: '12px', fontWeight: '500'}}>{c.nombre}</td>
                        <td style={{padding: '12px', fontSize: '13px', color: 'var(--text-muted)'}}>
                          {c.sucursalId} - {c.sucursalDescripcion}
                        </td>
                        <td style={{padding: '12px', textAlign: 'center'}}>
                          <button 
                            className="btn btn-primary" 
                            style={{padding: '6px 15px', fontSize: '13px'}}
                            onClick={() => handleSelectCustomer(c)}
                          >
                            Seleccionar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Global Sidebar Layout (Catalog + Cart) */}
      {step === 3 && (
        <div className="animate-fade-in" style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 350px',
          gap: '20px',
          alignItems: 'start'
        }}>
          {/* Main Column: Items Catalog */}
          <div className="catalog-container">
            <div className="card" style={{
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '8px',
              padding: '8px 16px',
              position: 'sticky',
              top: '0',
              zIndex: 100,
              background: 'white',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              borderBottom: '2px solid var(--primary)'
            }}>
              <div style={{display: 'flex', alignItems: 'baseline', gap: '15px'}}>
                <h2 style={{color: 'var(--primary)', margin: 0, fontSize: '1.2rem'}}>{selectedCustomer?.nombre}</h2>
                <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>NIT: {selectedCustomer?.nit}</span>
                <span style={{fontSize: '10px', background: '#f0f0f0', padding: '1px 6px', borderRadius: '4px', color: '#666', fontWeight: '600'}}>
                  Suc {selectedBranch?.id}
                </span>
                {items.length > 0 && items[0].listaPrecioCliente && (
                  <span style={{fontSize: '10px', background: '#e6f7ff', padding: '1px 6px', borderRadius: '4px', color: '#096dd9', fontWeight: '600', border: '1px solid #91d5ff'}}>
                    Lista Precio: {items[0].listaPrecioCliente}
                  </span>
                )}
              </div>
              <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
                <span style={{fontSize: '12px', fontWeight: 'bold', color: '#444'}}>Items ({filteredItems.length})</span>
                <button className="btn btn-primary" style={{background: 'var(--secondary)', padding: '4px 12px', fontSize: '11px'}} onClick={reset}>
                  Nueva Búsqueda
                </button>
              </div>
            </div>

            <div className="card" style={{padding: '0', overflow: 'hidden'}}>
              
              <div className="catalog-table-container" style={{overflowY: 'auto', maxHeight: 'calc(100vh - 180px)', border: 'none'}}>
                <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left'}}>
                  <thead style={{position: 'sticky', top: '0', zIndex: 90, boxShadow: '0 2px 4px rgba(0,0,0,0.05)'}}>
                    <tr style={{background: 'white', borderBottom: '2px solid #dee2e6'}}>
                      <th style={{padding: '12px 8px', width: '80px', background: 'white', borderTop: '1px solid #eee'}}>
                        <div style={{fontSize: '11px', marginBottom: '3px', fontWeight: 'bold', color: '#888'}}>Código</div>
                        <input className="input" style={{padding: '3px 8px', fontSize: '12px', width: '100%', height: '30px'}} placeholder="Filtrar" value={filters.id} onChange={(e) => { setFilters({...filters, id: e.target.value}); setCurrentPage(1); }} />
                      </th>
                      <th style={{padding: '12px 8px', background: 'white', borderTop: '1px solid #eee'}}>
                        <div style={{fontSize: '11px', marginBottom: '3px', fontWeight: 'bold', color: '#888'}}>Descripción</div>
                        <input className="input" style={{padding: '3px 8px', fontSize: '12px', width: '100%', height: '30px'}} placeholder="Filtrar" value={filters.descripcion} onChange={(e) => { setFilters({...filters, descripcion: e.target.value}); setCurrentPage(1); }} />
                      </th>
                      <th style={{padding: '12px 8px', fontSize: '11px', width: '50px', textAlign: 'center', background: 'white', borderTop: '1px solid #eee'}}>Unid.</th>
                      <th style={{padding: '12px 8px', fontSize: '11px', width: '40px', textAlign: 'center', background: 'white', borderTop: '1px solid #eee'}}>Fact.</th>
                      <th style={{padding: '12px 8px', fontSize: '11px', width: '50px', textAlign: 'right', background: 'white', borderTop: '1px solid #eee', color: '#17a2b8', fontWeight: 'bold'}}>Exist.</th>
                      <th style={{padding: '12px 8px', fontSize: '11px', width: '50px', textAlign: 'right', background: 'white', borderTop: '1px solid #eee', color: '#dc3545'}}>Compr.</th>
                      <th style={{padding: '12px 8px', fontSize: '11px', width: '50px', textAlign: 'right', background: 'white', borderTop: '1px solid #eee', color: '#28a745', fontWeight: 'bold'}}>Disp.</th>
                      <th style={{padding: '12px 8px', textAlign: 'right', fontSize: '11px', width: '90px', background: 'white', borderTop: '1px solid #eee'}}>Precio</th>
                      <th style={{padding: '12px 8px', textAlign: 'center', fontSize: '11px', width: '40px', background: 'white', borderTop: '1px solid #eee'}}>IVA</th>
                      <th style={{padding: '12px 8px', textAlign: 'center', width: '70px', fontSize: '11px', background: 'white', borderTop: '1px solid #eee'}}>Cant.</th>
                      <th style={{padding: '12px 8px', textAlign: 'center', fontSize: '11px', background: 'white', borderTop: '1px solid #eee'}}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedItems.map((group) => {
                      const hasVariants = group.variants.length > 1;
                      const mainItem = group.variants[0];

                      return (
                        <tr key={group.f120_id} style={{borderBottom: '1px solid #eee'}} className="table-row">
                          <td style={{padding: '8px', fontSize: '12px', fontWeight: 'bold'}}>{group.f120_id}</td>
                          <td style={{padding: '8px', fontSize: '13px'}}>
                            {group.f120_descripcion}
                            {hasVariants && <div style={{fontSize: '10px', color: 'var(--primary)', fontWeight: 'bold'}}>Múltiples opciones ({group.variants.length})</div>}
                          </td>
                          <td style={{padding: '8px', fontSize: '11px', color: '#666', textAlign: 'center'}}>{group.f120_id_unidad_inventario}</td>
                          <td style={{padding: '8px', fontSize: '11px', color: '#666', textAlign: 'center'}}>{group.f122_factor}</td>
                          
                          <td style={{padding: '8px', fontSize: '11px', textAlign: 'right', color: '#17a2b8', fontWeight: 'bold'}}>
                            {hasVariants ? '-' : (mainItem.existencia?.toLocaleString('es-CO') ?? '0')}
                          </td>
                          <td style={{padding: '8px', fontSize: '11px', textAlign: 'right', color: '#dc3545'}}>
                            {hasVariants ? '-' : (mainItem.comprometido?.toLocaleString('es-CO') ?? '0')}
                          </td>
                          <td style={{padding: '8px', fontSize: '11px', textAlign: 'right', color: '#28a745', fontWeight: 'bold'}}>
                            {hasVariants ? '-' : (mainItem.disponible?.toLocaleString('es-CO') ?? '0')}
                          </td>
                          
                          {hasVariants ? (
                            <>
                              <td colSpan="3" style={{padding: '8px', textAlign: 'center'}}>
                                <button 
                                  className="btn btn-primary" 
                                  style={{padding: '5px 15px', fontSize: '11px', background: '#333'}}
                                  onClick={() => setVariantModalItem(group)}
                                >
                                  Elegir Detalle ({group.variants.length})
                                </button>
                              </td>
                              <td style={{padding: '8px', textAlign: 'center'}}>
                                <button 
                                  className="btn btn-primary" 
                                  style={{padding: '5px 10px', fontSize: '11px'}}
                                  onClick={() => setVariantModalItem(group)}
                                >
                                  +
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{padding: '8px', textAlign: 'right', fontWeight: '600', fontSize: '13px'}}>
                                ${mainItem.f126_precio.toLocaleString('es-CO')}
                              </td>
                              <td style={{padding: '8px', textAlign: 'center', fontSize: '11px'}}>{mainItem.f037_tasa}%</td>
                              <td style={{padding: '8px', textAlign: 'center'}}>
                                <input 
                                  type="text" 
                                  className="input" 
                                  style={{padding: '3px', textAlign: 'center', width: '100%', fontSize: '14px', border: '1px solid #ddd'}}
                                  value={quantities[mainItem.f121_rowid] !== undefined ? quantities[mainItem.f121_rowid] : '1'}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d+$/.test(val)) {
                                      setQuantities({ ...quantities, [mainItem.f121_rowid]: val });
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    setQuantities({ ...quantities, [mainItem.f121_rowid]: Math.max(1, val).toString() });
                                  }}
                                />
                              </td>
                              <td style={{padding: '8px', textAlign: 'center'}}>
                                <button className="btn btn-primary" style={{padding: '5px 10px', fontSize: '11px'}} onClick={() => handleAddToCart(mainItem)}>
                                  +
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '40px', padding: '10px', borderTop: '1px solid #eee'}}>
                <button className="btn" style={{background: '#f0f0f0', padding: '4px 15px', fontSize: '12px'}} disabled={currentPage === 1} onClick={() => { setCurrentPage(prev => prev - 1); document.querySelector('.catalog-table-container')?.scrollTo(0,0); }}>
                  « Anterior
                </button>
                <span style={{fontSize: '12px', fontWeight: 'bold', color: '#666'}}>
                  Página {currentPage} de {totalPages}
                </span>
                <button className="btn" style={{background: '#f0f0f0', padding: '4px 15px', fontSize: '12px'}} disabled={currentPage === totalPages} onClick={() => { setCurrentPage(prev => prev + 1); document.querySelector('.catalog-table-container')?.scrollTo(0,0); }}>
                  Siguiente »
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar Cart Column */}
          <aside style={{
            position: 'sticky',
            top: '20px',
            height: 'calc(100vh - 40px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px'
          }}>
            <div className="card" style={{padding: '15px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '10px'}}>
                <h3 style={{color: 'var(--primary)', margin: 0}}>Resumen Venta</h3>
                <div style={{display: 'flex', gap: '5px'}}>
                  <button onClick={exportCartToExcel} title="Exportar Excel" style={{background: 'none', border: 'none', cursor: 'pointer', padding: '2px'}}>📊</button>
                  <button onClick={exportCartToPDF} title="Exportar PDF" style={{background: 'none', border: 'none', cursor: 'pointer', padding: '2px'}}>📄</button>
                </div>
              </div>
              
              <div style={{flex: 1, overflowY: 'auto', marginBottom: '15px', paddingRight: '5px'}}>
                {cart.length === 0 ? (
                  <p style={{textAlign: 'center', color: '#999', padding: '20px'}}>No hay productos seleccionados.</p>
                ) : (
                  cart.map((item) => (
                    <div key={item.f121_rowid} style={{
                      padding: '10px', 
                      background: '#fcfcfc', 
                      borderRadius: '8px', 
                      marginBottom: '8px',
                      border: '1px solid #f1f1f1',
                      fontSize: '12px'
                    }}>
                      <div style={{fontWeight: 'bold', marginBottom: '2px'}}>
                        {item.f120_descripcion}
                        {item.f121_id_ext1_detalle && (
                          <span style={{color: 'var(--primary)', marginLeft: '5px', fontSize: '10px'}}>
                            [{item.f121_id_ext1_detalle}]
                          </span>
                        )}
                      </div>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                          <button 
                            onClick={() => updateCartQuantity(item.f121_rowid, item.quantity - 1)}
                            style={{width: '24px', height: '24px', borderRadius: '50%', border: '1px solid #ccc', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '14px'}}
                          >
                            -
                          </button>
                          <input 
                            type="text" 
                            className="input"
                            value={item.quantity === 0 ? '' : item.quantity} 
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d+$/.test(val)) {
                                const num = val === '' ? 0 : parseInt(val);
                                // Update temporarily in place without deleting immediately
                                setCart(prev => prev.map(i => i.f121_rowid === item.f121_rowid ? { ...i, quantity: num } : i));
                              }
                            }}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              if (val < 1) {
                                setCart(prev => prev.filter(i => i.f121_rowid !== item.f121_rowid));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.target.blur();
                            }}
                            style={{
                              width: '45px', 
                              textAlign: 'center', 
                              padding: '2px',
                              height: '24px',
                              fontSize: '13px',
                              fontWeight: '600'
                            }}
                          />
                          <button 
                            onClick={() => updateCartQuantity(item.f121_rowid, item.quantity + 1)}
                            style={{width: '24px', height: '24px', borderRadius: '50%', border: '1px solid #ccc', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '14px'}}
                          >
                            +
                          </button>
                          <span style={{color: '#666', fontSize: '11px', marginLeft: '5px'}}>x ${item.f126_precio.toLocaleString('es-CO')}</span>
                        </div>
                        <div style={{fontWeight: 'bold', color: 'var(--primary)'}}>${(item.quantity * item.f126_precio).toLocaleString('es-CO')}</div>
                      </div>
                      <div style={{textAlign: 'right', marginTop: '5px'}}>
                        <button style={{background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '10px'}} onClick={() => setCart(cart.filter(i => i.f121_rowid !== item.f121_rowid))}>
                          Eliminar ×
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
 
              <div style={{borderTop: '2px solid var(--primary)', paddingTop: '10px', background: 'white', marginTop: 'auto'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '13px'}}>
                  <span>Subtotal:</span>
                  <span style={{fontWeight: 'bold'}}>${cartTotal.toLocaleString('es-CO')}</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '13px'}}>
                  <span>IVA:</span>
                  <span style={{fontWeight: 'bold'}}>${cart.reduce((acc, i) => acc + (i.f126_precio * i.quantity * (i.f037_tasa/100)), 0).toLocaleString('es-CO')}</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '10px', borderTop: '1px solid #eee', paddingTop: '10px'}}>
                  <span style={{fontWeight: 'bold', fontSize: '16px', color: 'var(--primary)'}}>TOTAL:</span>
                  <span style={{fontWeight: 'bold', fontSize: '18px', color: 'var(--primary)'}}>
                    ${(cartTotal + cart.reduce((acc, i) => acc + (i.f126_precio * i.quantity * (i.f037_tasa/100)), 0)).toLocaleString('es-CO')}
                  </span>
                </div>
                <button 
                  className="btn btn-primary" 
                  style={{width: '100%', marginTop: '15px', padding: '12px', fontWeight: 'bold'}} 
                  disabled={cart.length === 0 || loading}
                  onClick={handleConfirmOrder}
                >
                  {loading ? 'Guardando...' : 'Confirmar Pedido'}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

export default App
