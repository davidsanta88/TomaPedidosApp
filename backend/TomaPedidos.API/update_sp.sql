USE [SE_Connect]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER PROCEDURE [dbo].[sp_tmp_items_obtener]
    @NitCliente         NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ListaPrecioCliente NVARCHAR(10) = '001'; 
    
    IF @NitCliente IS NOT NULL AND LTRIM(RTRIM(@NitCliente)) <> ''
    BEGIN
        DECLARE @ListaEncontrada NVARCHAR(10);
        
        SELECT TOP 1 @ListaEncontrada = t201.f201_id_lista_precio
        FROM [Vadisa].[dbo].[t200_mm_terceros] t200
        INNER JOIN [Vadisa].[dbo].[t201_mm_clientes] t201 
            ON t200.f200_rowid = t201.f201_rowid_tercero
        WHERE t200.f200_id = @NitCliente; 

        IF @ListaEncontrada IS NOT NULL
        BEGIN
            SET @ListaPrecioCliente = @ListaEncontrada;
        END
    END

    -- ====== TEMPORALES SIESA ======
    SELECT f126_rowid_item, MAX(f126_fecha_ts_actualizacion) AS fecha
    INTO #tmp_precios
    FROM [Vadisa].[dbo].[t126_mc_items_precios]
    WHERE f126_id_lista_precio = @ListaPrecioCliente AND f126_id_cia = 1
    GROUP BY f126_rowid_item;

    SELECT t126.f126_rowid_item, t126.f126_precio, t120.f120_id,t120.f120_descripcion,
           t120.f120_id_unidad_inventario, t122.f122_factor
    INTO #tmp_items_siesa 
    FROM #tmp_precios p 
    INNER JOIN [Vadisa].[dbo].[t126_mc_items_precios] t126
        ON p.f126_rowid_item = t126.f126_rowid_item 
       AND p.fecha = t126.f126_fecha_ts_actualizacion
       AND t126.f126_id_lista_precio = @ListaPrecioCliente 
    INNER JOIN [Vadisa].[dbo].[t120_mc_items] t120 
        ON t120.f120_rowid = t126.f126_rowid_item
    INNER JOIN [Vadisa].[dbo].[t122_mc_items_unidades] t122
        ON t120.f120_rowid = t122.f122_rowid_item 
       AND t120.f120_id_cia = 1 
       AND t120.f120_id_unidad_inventario = t122.f122_id_unidad;

    SELECT DISTINCT t120.f120_rowid, t037.f037_tasa 
    INTO #tmp_items_imp 
    FROM [Vadisa].dbo.t120_mc_items t120 
    INNER JOIN [Vadisa].dbo.t113_mc_grupos_impositivos t113 
        ON t113.f113_id_cia = t120.f120_id_cia 
       AND t113.f113_id     = t120.f120_id_grupo_impositivo 
       AND t120.f120_id_cia = 1
    LEFT JOIN [Vadisa].dbo.t114_mc_grupos_impo_impuestos t114 
        ON t114.f114_id_cia            = t113.f113_id_cia 
       AND t114.f114_grupo_impositivo = t113.f113_id 
       AND t120.f120_id_grupo_impositivo = t114.f114_grupo_impositivo
    LEFT JOIN [Vadisa].dbo.t037_mm_llaves_impuesto t037 
        ON t037.f037_id_cia = t114.f114_id_cia 
       AND t037.f037_id     = t114.f114_id_llave_impuesto;

    SELECT 
        f126_rowid_item rowid_item,
        f120_id,
        f120_descripcion,
        f126_precio,
        f120_id_unidad_inventario,
        f122_factor,
        ISNULL(f037_tasa,0)f037_tasa,
        f121_rowid,
        ISNULL(f121_id_ext1_detalle,'') AS f121_id_ext1_detalle,
        t400.f400_cant_existencia_1 AS Existencia, 
        t400.f400_cant_comprometida_1 AS Comprometido, 
        t400.f400_cant_existencia_1 - t400.f400_cant_salida_sin_conf_1 - t400.f400_cant_comprometida_1 AS Disponible
    FROM  #tmp_items_siesa AS s 
    INNER JOIN #tmp_items_imp AS i
        ON i.f120_rowid = s.f126_rowid_item
    INNER JOIN  [Vadisa].[dbo].[t121_mc_items_extensiones] T121 ON T121.f121_rowid_item=f120_rowid
    INNER JOIN [Vadisa].dbo.t400_cm_existencia t400 ON t400.f400_rowid_item_ext = t121.f121_rowid
    INNER JOIN [Vadisa].dbo.t150_mc_bodegas t150
        ON t400.f400_rowid_bodega = t150.f150_rowid
        AND t150.f150_id ='BD008'
    WHERE f121_ind_estado=1 --PRODUCTOS ACTIVOS EN SIESA
        and f400_cant_existencia_1>0
    ORDER BY f120_descripcion,f121_id_ext1_detalle ASC
	
    -- Limpieza segura
    IF OBJECT_ID('tempdb..#tmp_items_imp') IS NOT NULL DROP TABLE #tmp_items_imp;
    IF OBJECT_ID('tempdb..#tmp_items_siesa') IS NOT NULL DROP TABLE #tmp_items_siesa;
    IF OBJECT_ID('tempdb..#tmp_precios')     IS NOT NULL DROP TABLE #tmp_precios;
END
GO
