-- Amplía el campo existente para escribir varios barrios sin truncar nombres.
ALTER TABLE grupo_comunion MODIFY COLUMN barrio TEXT NULL;
INSERT INTO migracion_aplicada(nombre) VALUES ('012-group-neighborhood-text.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
