import { isCategory } from '@/lib/categories';

const INK: Record<string, string> = {
  docs: 'text-carbon',
  bug: 'text-del',
  feature: 'text-bch',
  security: 'text-del',
  other: 'text-ink-2',
};

/** Small rubber-stamp label for a bounty category. Renders nothing for unknown values. */
export function CategoryStamp({ category, size = 'sm' }: { category: unknown; size?: 'xs' | 'sm' }) {
  if (!isCategory(category)) return null;
  return (
    <span className={`stamp ${INK[category]} ${size === 'xs' ? 'text-[9px] !px-1 !py-0 !border-2' : 'text-[11px]'} align-middle`} title={`Category: ${category}`}>
      {category}
    </span>
  );
}
