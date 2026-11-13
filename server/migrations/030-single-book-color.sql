-- Each disciple has one training book (miembro.id_libro): a new assignment replaces the previous one.
-- Additional books from 028 are no longer used and are cleared. Each book gets a color that also marks its disciples.
SET @book_color = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='libro_adiestramiento' AND COLUMN_NAME='color'), 'SELECT 1', 'ALTER TABLE libro_adiestramiento ADD COLUMN color CHAR(7) NULL');
PREPARE book_color_stmt FROM @book_color;
EXECUTE book_color_stmt;
DEALLOCATE PREPARE book_color_stmt;

UPDATE libro_adiestramiento SET color=ELT(MOD(id_libro-1,12)+1,'#e4572e','#2e86ab','#3bb273','#9b5de5','#f4a259','#d1495b','#00a6a6','#7a6c5d','#c2185b','#5c6bc0','#8bc34a','#ff8f00') WHERE color IS NULL;

DELETE FROM miembro_libro_adicional;

INSERT INTO migracion_aplicada(nombre) VALUES ('030-single-book-color.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
