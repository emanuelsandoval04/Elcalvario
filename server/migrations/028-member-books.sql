-- A disciple can study several training books at once. miembro.id_libro stays as the main
-- book (filters, reports, profile), and the other books are kept here in the order they were chosen.
CREATE TABLE IF NOT EXISTS miembro_libro_adicional (
  id_miembro INT NOT NULL,
  id_libro INT NOT NULL,
  posicion SMALLINT NOT NULL,
  fecha_asignacion DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id_miembro, id_libro),
  INDEX idx_miembro_libro_adicional_libro (id_libro),
  CONSTRAINT fk_miembro_libro_adicional_miembro FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro) ON DELETE CASCADE,
  CONSTRAINT fk_miembro_libro_adicional_libro FOREIGN KEY (id_libro) REFERENCES libro_adiestramiento(id_libro)
) ENGINE=InnoDB;

INSERT INTO migracion_aplicada(nombre) VALUES ('028-member-books.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
