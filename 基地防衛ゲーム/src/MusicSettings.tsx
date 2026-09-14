import { Volume2, VolumeX } from 'lucide-react';
import type { Save } from './game/state';
export default function MusicSettings({ settings, change }: { settings: Save['settings']; change: () => void }) {
  return <div className="setting-row sound-setting"><div><strong>BGM</strong><p>朝露の小径 / 灯りを守る足音。最初のタップから再生します。</p><label><span>音量 {Math.round(settings.bgmVolume * 100)}%</span><input type="range" min="0" max="100" step="5" value={Math.round(settings.bgmVolume * 100)} aria-label="BGMの音量" disabled={settings.bgmMuted} onChange={event => { settings.bgmVolume = Number(event.target.value) / 100; change(); }}/></label></div><button className={`sound-mute ${settings.bgmMuted ? 'muted' : ''}`} role="switch" aria-checked={!settings.bgmMuted} aria-label="BGM再生" onClick={() => { settings.bgmMuted = !settings.bgmMuted; change(); }}>{settings.bgmMuted ? <VolumeX size={18}/> : <Volume2 size={18}/>}<span>{settings.bgmMuted ? 'ミュート中' : '再生中'}</span></button></div>;
}
