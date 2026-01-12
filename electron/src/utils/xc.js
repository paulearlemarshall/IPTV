export const getXcUrl = (stream, type, profile, server) => {
  if (!stream || !profile || !server) return null;
  const base = server.replace(/\/$/, "");
  const { username, password } = profile;
  const id = stream.stream_id || stream.id;

  if (type === 'live') {
    return `${base}/${username}/${password}/${id}.ts`;
  } else if (type === 'vod' || type === 'episode') {
    const ext = stream.container_extension || 'mp4';
    const path = type === 'episode' ? 'series' : 'movie';
    return `${base}/${path}/${username}/${password}/${id}.${ext}`;
  }
  return null;
};

export const getXcLogoUrl = (stream, server) => {
  if (!stream) return null;
  const rawLogo = stream.stream_icon || stream.cover;
  if (!rawLogo || !server) return rawLogo;
  if (rawLogo.startsWith('http')) return rawLogo;
  const base = server.replace(/\/$/, "");
  return `${base}${rawLogo.startsWith('/') ? '' : '/'}${rawLogo}`;
};
