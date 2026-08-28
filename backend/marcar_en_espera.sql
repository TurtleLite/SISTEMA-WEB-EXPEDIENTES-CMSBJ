-- Poner estatus_cirugia = 'En espera' a los expedientes ingresados por el usuario cargapx
-- en la lista "Expediente Médico" (los 533 cargados desde SIN OPERAR).
-- Un UPDATE directo salta la restricción de rol que bloquea a cargapx en el API.
-- Ejecutar desde la carpeta backend del mini-PC:
--   psql "$DATABASE_URL" -f marcar_en_espera.sql

UPDATE list_records
SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{estatus_cirugia}', '"En espera"', true),
    updated_at = now()
WHERE list_definition_id = (
        SELECT id FROM list_definitions
        WHERE name = 'Expediente Médico' AND deleted_at IS NULL
      )
  AND created_by = (SELECT id FROM users WHERE username = 'cargapx')
  AND (data->>'estatus_cirugia' IS NULL OR data->>'estatus_cirugia' <> 'En espera');

-- Verificación:
-- SELECT count(*) AS en_espera
-- FROM list_records
-- WHERE list_definition_id = (SELECT id FROM list_definitions WHERE name='Expediente Médico' AND deleted_at IS NULL)
--   AND created_by = (SELECT id FROM users WHERE username='cargapx')
--   AND data->>'estatus_cirugia' = 'En espera';
