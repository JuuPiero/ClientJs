import {
  ActionIcon,
  getTreeExpandedState,
  Group,
  Menu,
  ScrollArea,
  Text,
  Tooltip,
  Tree,
  useTree,
  type TreeNodeData,
} from '@mantine/core';
import {
  IconBraces,
  IconBrandJavascript,
  IconChevronRight,
  IconDots,
  IconFile,
  IconFilePlus,
  IconFolder,
  IconFolderOpen,
  IconMarkdown,
  IconPencil,
  IconPlayerPlay,
  IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { createFile, deletePath, movePath, renamePath } from '../lib/actions';
import { useCurrentProject, useAppStore } from '../store/appStore';

// Thư mục là ngầm định (suy ra từ path có "/"); value của node thư mục kết thúc bằng "/".
const isFolder = (value: string) => value.endsWith('/');
const folderPath = (value: string) => value.slice(0, -1);
const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const baseOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

function buildTree(paths: string[]): TreeNodeData[] {
  const root: TreeNodeData[] = [];
  const folders = new Map<string, TreeNodeData>();
  for (const path of paths) {
    const parts = path.split('/');
    let level = root;
    let prefix = '';
    parts.forEach((part, i) => {
      prefix = prefix ? `${prefix}/${part}` : part;
      if (i === parts.length - 1) {
        level.push({ value: path, label: part });
        return;
      }
      let folder = folders.get(prefix);
      if (!folder) {
        folder = { value: `${prefix}/`, label: part, children: [] };
        folders.set(prefix, folder);
        level.push(folder);
      }
      level = folder.children!;
    });
  }
  const sort = (nodes: TreeNodeData[]) => {
    nodes.sort((a, b) => Number(!!b.children) - Number(!!a.children) || String(a.label).localeCompare(String(b.label)));
    nodes.forEach((n) => n.children && sort(n.children));
  };
  sort(root);
  return root;
}

function FileIcon({ path }: { path: string }) {
  if (/\.(m|c)?jsx?$/.test(path)) return <IconBrandJavascript size={15} color="var(--mantine-color-yellow-5)" />;
  if (path.endsWith('.json')) return <IconBraces size={15} color="var(--mantine-color-orange-4)" />;
  if (path.endsWith('.md')) return <IconMarkdown size={15} color="var(--mantine-color-blue-4)" />;
  return <IconFile size={15} color="var(--mantine-color-dimmed)" />;
}

export function FileTree() {
  const project = useCurrentProject();
  const openFile = useAppStore((s) => s.openFile);
  const setEntry = useAppStore((s) => s.setEntry);
  const pathsKey = project ? Object.keys(project.files).sort().join('\n') : '';
  const data = useMemo(() => buildTree(pathsKey ? pathsKey.split('\n') : []), [pathsKey]);

  // Thư mục mặc định mở (kể cả thư mục mới tạo); chỉ nhớ những thư mục người dùng đã thu gọn.
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const expandedState = useMemo(() => {
    const state = getTreeExpandedState(data, '*');
    for (const value of collapsed) state[value] = false;
    return state;
  }, [data, collapsed]);
  const tree = useTree({
    expandedState,
    onExpandedStateChange: (s) => setCollapsed(Object.keys(s).filter((k) => !s[k])),
  });

  if (!project) return null;

  return (
    <>
      <Group justify="space-between" px="sm" pt="sm" pb={4}>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
          Files
        </Text>
        <Tooltip label="File mới (vd. lib/utils.js)">
          <ActionIcon variant="subtle" size="sm" onClick={() => createFile()} aria-label="File mới">
            <IconFilePlus size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <ScrollArea style={{ flex: 1 }} type="hover" px={6} pb="sm">
        <Tree
          data={data}
          tree={tree}
          levelOffset={14}
          expandOnClick
          onDragDrop={({ draggedNode, targetNode, position }) => {
            const from = isFolder(draggedNode) ? folderPath(draggedNode) : draggedNode;
            const targetDir =
              position === 'inside' && isFolder(targetNode)
                ? folderPath(targetNode)
                : dirOf(isFolder(targetNode) ? folderPath(targetNode) : targetNode);
            const to = targetDir ? `${targetDir}/${baseOf(from)}` : baseOf(from);
            if (to !== from && !to.startsWith(`${from}/`)) movePath(from, to);
          }}
          renderNode={({ node, expanded, hasChildren, elementProps }) => {
            const folder = isFolder(node.value);
            const path = folder ? folderPath(node.value) : node.value;
            const active = !folder && project.activeFile === path;
            return (
              <Group
                gap={6}
                wrap="nowrap"
                {...elementProps}
                className={`${elementProps.className} tree-row`}
                data-active={active || undefined}
                onClick={(e) => {
                  elementProps.onClick(e);
                  if (!folder) openFile(path);
                }}
              >
                {hasChildren ? (
                  <IconChevronRight size={13} className="chevron" data-expanded={expanded || undefined} />
                ) : (
                  <span style={{ width: 13, flexShrink: 0 }} />
                )}
                {folder ? (
                  expanded ? (
                    <IconFolderOpen size={15} color="var(--mantine-color-indigo-4)" />
                  ) : (
                    <IconFolder size={15} color="var(--mantine-color-indigo-4)" />
                  )
                ) : (
                  <FileIcon path={path} />
                )}
                <Text size="sm" truncate style={{ flex: 1 }}>
                  {node.label}
                </Text>
                {!folder && project.entry === path && (
                  <Tooltip label="Entry — file được chạy">
                    <IconPlayerPlay size={12} color="var(--mantine-color-teal-5)" />
                  </Tooltip>
                )}

                <Menu position="bottom-end" withinPortal shadow="md">
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="xs"
                      className="row-action"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Thao tác"
                    >
                      <IconDots size={14} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                    {folder ? (
                      <Menu.Item leftSection={<IconFilePlus size={14} />} onClick={() => createFile(path)}>
                        File mới trong thư mục
                      </Menu.Item>
                    ) : (
                      <Menu.Item
                        leftSection={<IconPlayerPlay size={14} />}
                        disabled={project.entry === path}
                        onClick={() => setEntry(path)}
                      >
                        Đặt làm entry
                      </Menu.Item>
                    )}
                    <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => renamePath(path, folder)}>
                      Đổi tên / di chuyển
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => deletePath(path, folder)}>
                      Xoá
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            );
          }}
        />
      </ScrollArea>
    </>
  );
}
