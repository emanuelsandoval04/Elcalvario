-- Data consistency, safe to rerun.
-- 1. Disciples of an archived group stay without group, and the change enters their group history.
INSERT INTO historial_miembro(id_miembro,concepto,id_anterior,id_nuevo,id_usuario)
SELECT m.id_miembro,'grupo',m.id_grupo,NULL,NULL FROM miembro m JOIN grupo_comunion g ON g.id_grupo=m.id_grupo WHERE g.archivado=1;

UPDATE miembro m JOIN grupo_comunion g ON g.id_grupo=m.id_grupo SET m.id_grupo=NULL WHERE g.archivado=1;

-- 2. A record linked to an access account is not archived: the account needs its record.
UPDATE miembro m JOIN usuario u ON u.id_miembro=m.id_miembro SET m.archivado=0 WHERE m.archivado=1;

INSERT INTO migracion_aplicada(nombre) VALUES ('031-data-consistency.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
