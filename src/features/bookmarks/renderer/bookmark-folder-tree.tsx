import type { BookmarkNode } from '../../../shared/contracts/bookmarks';

type Props = { nodes: BookmarkNode[]; selectedId: string; onSelect: (id: string) => void };

export function BookmarkFolderTree({ nodes, selectedId, onSelect }: Props) {
  function children(parentId: string | null, depth: number): React.ReactNode {
    return nodes.filter(node => node.kind === 'folder' && node.parentId === parentId)
      .sort((left, right) => left.position - right.position)
      .map(folder => <div key={folder.id}>
        <button type="button" aria-current={selectedId === folder.id ? 'page' : undefined}
          style={{ paddingInlineStart: 14 + depth * 14 }} onClick={() => onSelect(folder.id)}>
          <span aria-hidden="true">▱</span> {folder.title}
        </button>
        {children(folder.id, depth + 1)}
      </div>);
  }
  return <nav className="bookmark-folders" aria-label="书签文件夹">{children(null, 0)}</nav>;
}
