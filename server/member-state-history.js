export async function recordMemberState(connection, id, state, actorId) {
  await connection.execute('INSERT INTO historial_estado_miembro(id_miembro,estado,id_usuario) VALUES (?,?,?)', [id,state,actorId])
}
