// Account roles come from trusted server configuration, never editable Auth metadata.
export function identities(env) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const e = env.ELEVELY_USER_ID?.trim(), m = env.MASHKA_USER_ID?.trim();
  const configured = uuid.test(e || '') && uuid.test(m || '') && e !== m;
  return {
    configured,
    find(id) { return configured && id === e ? {id,role:'elevely',name:'elevely'} : configured && id === m ? {id,role:'mashka',name:'Машка'} : null; }
  };
}
