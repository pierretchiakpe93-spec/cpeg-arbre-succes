// Une seule session active par compte : la première connexion garde le verrou.
function installSessionLock(client, messageElement) {
  const key = 'cpeg_auth_device_id';
  let deviceId;
  try {
    deviceId = localStorage.getItem(key);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(key, deviceId);
    }
  } catch {
    deviceId = crypto.randomUUID();
  }

  const auth = client.auth;
  const signIn = auth.signInWithPassword.bind(auth);
  const signUp = auth.signUp.bind(auth);
  const getSession = auth.getSession.bind(auth);
  const signOut = auth.signOut.bind(auth);

  async function claim(result) {
    if (result.error || !result.data?.session) return result;
    const { data, error } = await client.rpc('claim_device_session', { p_device_id: deviceId });
    if (error) {
      await signOut({ scope: 'local' });
      return { ...result, data: { ...result.data, session: null, user: null }, error: new Error('Vérification de session impossible. Demandez de l’aide à l’administrateur.') };
    }
    if (data === true) return result;
    await signOut({ scope: 'local' });
    return { ...result, data: { ...result.data, session: null, user: null }, error: new Error('Ce compte est déjà connecté sur un autre appareil. Déconnectez-le d’abord, puis réessayez.') };
  }

  auth.signInWithPassword = async (...args) => claim(await signIn(...args));
  auth.signUp = async (...args) => claim(await signUp(...args));
  auth.getSession = async (...args) => {
    const result = await getSession(...args);
    if (!result.data?.session) return result;
    const checked = await claim(result);
    if (checked.error && messageElement) messageElement.textContent = checked.error.message;
    return checked.error ? { ...checked, data: { session: null, user: null } } : checked;
  };
  window.releaseDeviceSession = async () => {
    const { error } = await client.rpc('release_device_session', { p_device_id: deviceId });
    return error;
  };
}
