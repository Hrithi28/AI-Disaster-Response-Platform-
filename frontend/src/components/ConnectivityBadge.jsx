import { Cloud, CloudOff, Wifi, WifiOff } from 'lucide-react';
import { connectionLevel, useLive } from '../context/LiveData';
import { LEVEL } from '../lib/constants';

export default function ConnectivityBadge({ compact = false, extra }) {
  const live = useLive();
  const level = connectionLevel(live);
  const L = LEVEL[level];
  const Icon = level === 'online' ? Cloud : level === 'lan' ? Wifi : WifiOff;
  return (
    <span className={`chip border !px-2.5 !py-1 ${L.cls}`} title={L.label}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: L.dot }} />
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: L.dot }} />
      </span>
      <Icon size={12} />
      {compact ? L.short : L.label}
      {live.connectivity?.forcedOffline && <span className="opacity-80">· drill</span>}
      {extra}
    </span>
  );
}

export { CloudOff };
