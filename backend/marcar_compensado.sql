-- Aplicar compensado = "Sí" a TODOS los expedientes de la lista "Expediente Médico".
-- Úsalo DESPUÉS de importar por Excel (la importación por Excel no admite el campo compensado,
-- porque no es columna del formulario). Si ingresaste con ingresar_expedientes.py, ya está aplicado.

UPDATE list_records
SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{compensado}', '"Sí"', true)
WHERE list_definition_id = (
        SELECT id FROM list_definitions
        WHERE name = 'Expediente Médico' AND deleted_at IS NULL
      )
  AND (data->>'compensado' IS NULL OR data->>'compensado' <> 'Sí');

-- Verificación:
-- SELECT data->>'compensado' AS compensado, count(*) FROM list_records
-- WHERE list_definition_id = (SELECT id FROM list_definitions WHERE name='Expediente Médico' AND deleted_at IS NULL)
-- GROUP BY 1;
