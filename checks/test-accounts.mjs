// Accounts for checks. Public self-registration is closed: accounts are created by an administrator
// (Usuarios y roles) or, for the owner, by the installation script. Checks that only need an account
// to exist create it directly in their temporary database with these helpers.
// Import this module after DB_NAME points at the test database: server/auth.js opens the pool.
const { hashPassword } = await import('../server/auth.js')
const { reserveCode } = await import('../server/public-codes.js')

// state 'pendiente' with no role reproduces an account still waiting for activation.
export async function createAccount(db, { email, password, role = null, state = role ? 'activo' : 'pendiente', name = null, memberId = null }) {
  const [user] = await db.execute('INSERT INTO usuario(correo_login,password_hash,estado_usuario,id_miembro,codigo_usuario) VALUES (?,?,?,?,?)',
    [email.trim().toLowerCase(), await hashPassword(password), state, memberId, await reserveCode(db, 'usuario')])
  if (name) await db.execute('INSERT INTO perfil_usuario(id_usuario,nombre) VALUES (?,?)', [user.insertId, name])
  if (role) {
    const [assigned] = await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) SELECT ?,id_rol FROM rol_sistema WHERE nombre=?', [user.insertId, role])
    if (!assigned.affectedRows) throw new Error(`Rol de prueba inexistente: ${role}`)
  }
  return user.insertId
}

// The installation owner (Administrador), as `npm run bootstrap:admin` creates it.
export async function createOwner({ email, password, name = 'Propietario' }) {
  const { bootstrapAdmin } = await import('../server/bootstrap-admin.js')
  return (await bootstrapAdmin({ email, password, name })).id
}
