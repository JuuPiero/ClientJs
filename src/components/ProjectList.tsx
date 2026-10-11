import { ActionIcon, Badge, Group, Menu, ScrollArea, Text, Tooltip, UnstyledButton } from '@mantine/core';
import {
  IconCopy,
  IconDots,
  IconDownload,
  IconFileExport,
  IconPencil,
  IconPlus,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { useMemo } from 'react';
import { deleteProject, exportAllProjects, exportProject, importProjects, renameProject } from '../lib/actions';
import { timeAgo } from '../lib/files';
import { RUNTIME_INFO } from '../runtimes';
import { useAppStore } from '../store/appStore';
import { openNewProjectModal } from './NewProjectModal';

export function ProjectList({ onNavigate }: { onNavigate: () => void }) {
  const projectsById = useAppStore((s) => s.projects);
  const currentId = useAppStore((s) => s.currentId);
  const openProject = useAppStore((s) => s.openProject);
  const duplicate = useAppStore((s) => s.duplicateProject);

  const projects = useMemo(
    () => Object.values(projectsById).sort((a, b) => b.updatedAt - a.updatedAt),
    [projectsById],
  );

  return (
    <>
      <Group justify="space-between" px="sm" pt="sm" pb={4}>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
          Dự án
        </Text>
        <Group gap={2}>
          <Tooltip label="Import từ file .json">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={importProjects} aria-label="Import">
              <IconUpload size={15} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Export tất cả">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={exportAllProjects} aria-label="Export tất cả">
              <IconDownload size={15} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Dự án mới">
            <ActionIcon variant="subtle" size="sm" onClick={openNewProjectModal} aria-label="Dự án mới">
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <ScrollArea.Autosize mah="34vh" type="hover" px={6}>
        {projects.map((p) => {
          const info = RUNTIME_INFO[p.runtime];
          return (
            <Group key={p.id} gap={0} wrap="nowrap" className="list-row" data-active={p.id === currentId || undefined}>
              <UnstyledButton
                className="list-row-main"
                onClick={() => {
                  openProject(p.id);
                  onNavigate();
                }}
              >
                <Group gap={8} wrap="nowrap">
                  <Badge size="xs" variant="light" color={info.color} w={42} style={{ flexShrink: 0 }}>
                    {info.short}
                  </Badge>
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" truncate>
                      {p.name}
                    </Text>
                    <Text size="10px" c="dimmed">
                      {timeAgo(p.updatedAt)}
                    </Text>
                  </div>
                </Group>
              </UnstyledButton>

              <Menu position="bottom-end" withinPortal shadow="md">
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" size="sm" className="row-action" aria-label="Thao tác">
                    <IconDots size={15} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => renameProject(p.id)}>
                    Đổi tên
                  </Menu.Item>
                  <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => duplicate(p.id)}>
                    Nhân bản
                  </Menu.Item>
                  <Menu.Item leftSection={<IconFileExport size={14} />} onClick={() => exportProject(p.id)}>
                    Export .json
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => deleteProject(p.id)}>
                    Xoá
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          );
        })}
      </ScrollArea.Autosize>
    </>
  );
}
