import { Icon, type IconName } from '@/components/Icon';
import type { NetSearchMeta } from '@/music/netease/netease-api';
import {
  flattenSearchSuggestions,
  type SearchSuggestion,
} from '@/music/netease/search-suggestions';

interface SearchSuggestionPanelProps {
  meta: NetSearchMeta;
  activeIndex: number;
  onSelect: (suggestion: SearchSuggestion) => void;
}

const groups: Array<{
  type: SearchSuggestion['type'];
  label: string;
  icon: IconName;
}> = [
  { type: 'artist', label: '歌手', icon: 'user' },
  { type: 'song', label: '单曲', icon: 'music' },
  { type: 'album', label: '专辑', icon: 'album' },
  { type: 'playlist', label: '歌单', icon: 'library' },
];

function getGroupItems(meta: NetSearchMeta, type: SearchSuggestion['type']): SearchSuggestion[] {
  if (type === 'artist') return meta.artists.map((item) => ({ type, item }));
  if (type === 'song') return meta.songs.map((item) => ({ type, item }));
  if (type === 'album') return meta.albums.map((item) => ({ type, item }));
  return meta.playlists.map((item) => ({ type, item }));
}

function titleFor(suggestion: SearchSuggestion): string {
  if (suggestion.type === 'song') return suggestion.item.name;
  return suggestion.item.name;
}

function subtitleFor(suggestion: SearchSuggestion): string {
  if (suggestion.type === 'artist') return '歌手';
  if (suggestion.type === 'song') {
    return [suggestion.item.artist, suggestion.item.album].filter(Boolean).join(' · ') || '单曲';
  }
  if (suggestion.type === 'album') return suggestion.item.artist || '专辑';
  const item = suggestion.item;
  const count = item.trackCount > 0 ? `${item.trackCount} 首` : '';
  return [item.creator, count].filter(Boolean).join(' · ') || '歌单';
}

function coverFor(suggestion: SearchSuggestion): string | undefined {
  if (suggestion.type === 'artist' || suggestion.type === 'album' || suggestion.type === 'playlist') {
    return suggestion.item.coverUrl;
  }
  return suggestion.item.coverUrl;
}

export function SearchSuggestionPanel({
  meta,
  activeIndex,
  onSelect,
}: SearchSuggestionPanelProps) {
  const flat = flattenSearchSuggestions(meta);
  if (!flat.length) return null;

  return (
    <div className="search-suggestions" role="listbox" aria-label="搜索建议">
      {groups.map((group) => {
        const items = getGroupItems(meta, group.type);
        if (!items.length) return null;
        return (
          <section key={group.type} className="search-suggestions__group">
            <div className="search-suggestions__label">
              <Icon name={group.icon} size={14} />
              <span>{group.label}</span>
            </div>
            <div className="search-suggestions__items">
              {items.map((suggestion) => {
                const index = flat.findIndex(
                  (candidate) =>
                    candidate.type === suggestion.type &&
                    candidate.item.id === suggestion.item.id,
                );
                const cover = coverFor(suggestion);
                const active = index === activeIndex;
                return (
                  <button
                    key={`${suggestion.type}-${suggestion.item.id}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={'search-suggestions__item' + (active ? ' is-active' : '')}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelect(suggestion)}
                  >
                    {cover ? (
                      <img className="search-suggestions__cover" src={cover} alt="" loading="lazy" />
                    ) : (
                      <span className="search-suggestions__cover search-suggestions__cover--fallback">
                        <Icon name={group.icon} size={16} />
                      </span>
                    )}
                    <span className="search-suggestions__copy">
                      <span className="search-suggestions__title">{titleFor(suggestion)}</span>
                      <span className="search-suggestions__subtitle">{subtitleFor(suggestion)}</span>
                    </span>
                    <Icon name="chevronRight" size={15} className="search-suggestions__arrow" />
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <div className="search-suggestions__hint">↑↓ 选择 · Enter 确认 · Esc 关闭</div>
    </div>
  );
}
