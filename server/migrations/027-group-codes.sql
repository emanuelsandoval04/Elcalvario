-- Automatic group codes: GR-01, GR-02... (GR-100 after GR-99). The server assigns them from
-- secuencia_codigo('grupo') and they are never reused. Existing groups are renumbered ONCE in
-- creation order (archived ones included, so their codes stay unique). Later reruns change nothing.
UPDATE grupo_comunion SET codigo_grupo=CONCAT('TMP-027-',id_grupo)
WHERE NOT EXISTS(SELECT 1 FROM migracion_aplicada WHERE nombre='027-group-codes.sql');

UPDATE grupo_comunion g JOIN (SELECT id_grupo, ROW_NUMBER() OVER (ORDER BY id_grupo) AS position FROM grupo_comunion) ordered ON ordered.id_grupo=g.id_grupo
SET g.codigo_grupo=CONCAT('GR-',LPAD(ordered.position,GREATEST(2,LENGTH(ordered.position)),'0'))
WHERE NOT EXISTS(SELECT 1 FROM migracion_aplicada WHERE nombre='027-group-codes.sql');

INSERT INTO secuencia_codigo(nombre,ultimo)
SELECT 'grupo',COALESCE(MAX(CAST(SUBSTRING(codigo_grupo,4) AS UNSIGNED)),0) FROM grupo_comunion WHERE codigo_grupo REGEXP '^GR-[0-9]+$'
ON DUPLICATE KEY UPDATE ultimo=GREATEST(ultimo,VALUES(ultimo));

INSERT INTO migracion_aplicada(nombre) VALUES ('027-group-codes.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
