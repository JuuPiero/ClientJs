import { ActionIcon, Burger, Button, Group, Kbd, Select, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconPencil, IconPlayerPlayFilled, IconPlayerStopFilled, IconSettings, IconTerminal2 } from '@tabler/icons-react';
import { renameProject } from '../lib/actions';
import { RUNTIME_IDS, RUNTIME_INFO, runtimes } from '../runtimes';
import { openShell, runCurrent, stopCurrent, useRunState } from '../runner';
import { useAppStore } from '../store/appStore';
import type { RuntimeId } from '../types';
import { openSettingsModal } from './SettingsModal';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function Header({ sidebarOpen, onToggleSidebar }: { sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const projectId = useAppStore((s) => s.currentId);
  const name = useAppStore((s) => (s.currentId ? s.projects[s.currentId]?.name : undefined));
  const runtime = useAppStore((s) => (s.currentId ? s.projects[s.currentId]?.runtime : undefined));
  const setRuntime = useAppStore((s) => s.setRuntime);
  const running = useRunState((s) => s.status === 'running');

  return (
    <Group h="100%" px="sm" gap="sm" wrap="nowrap">
      <Burger opened={sidebarOpen} onClick={onToggleSidebar} size="sm" aria-label="Ẩn/hiện sidebar" />
      <Text fw={800} size="lg" className="brand" visibleFrom="xs">
        Client<span>JS</span>
      </Text>

      {projectId && (
        <UnstyledButton className="project-title" onClick={() => renameProject(projectId)}>
          <Group gap={6} wrap="nowrap">
            <Text fw={500} truncate maw={240}>
              {name}
            </Text>
            <IconPencil size={14} className="dim" />
          </Group>
        </UnstyledButton>
      )}

      <Group gap="xs" ml="auto" wrap="nowrap">
        {runtime && (
          <Tooltip label={RUNTIME_INFO[runtime].description} multiline w={280} openDelay={400}>
            <Select
              size="xs"
              w={190}
              visibleFrom="sm"
              value={runtime}
              allowDeselect={false}
              onChange={(v) => v && setRuntime(v as RuntimeId)}
              data={RUNTIME_IDS.map((id) => ({
                value: id,
                label: RUNTIME_INFO[id].label,
                disabled: runtimes[id].unavailableReason() !== null,
              }))}
            />
          </Tooltip>
        )}

        {runtime === 'webcontainer' && (
          <Tooltip label="Mở shell (jsh) trong container">
            <ActionIcon variant="default" size="lg" onClick={openShell} aria-label="Terminal">
              <IconTerminal2 size={18} />
            </ActionIcon>
          </Tooltip>
        )}

        {running ? (
          <Button color="red" size="xs" leftSection={<IconPlayerStopFilled size={14} />} onClick={stopCurrent}>
            Stop
          </Button>
        ) : (
          <Tooltip
            label={
              <>
                Chạy <Kbd size="xs">{isMac ? '⌘' : 'Ctrl'}</Kbd> + <Kbd size="xs">Enter</Kbd>
              </>
            }
          >
            <Button color="teal" size="xs" leftSection={<IconPlayerPlayFilled size={14} />} onClick={runCurrent} disabled={!projectId}>
              Run
            </Button>
          </Tooltip>
        )}

        <Tooltip label="Cài đặt">
          <ActionIcon variant="subtle" color="gray" size="lg" onClick={openSettingsModal} aria-label="Cài đặt">
            <IconSettings size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}
