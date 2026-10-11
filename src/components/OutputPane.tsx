import { ActionIcon, Badge, Group, Loader, Text, Tooltip } from '@mantine/core';
import { IconClearAll, IconExternalLink, IconRefresh, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { Group as PanelGroup, Panel, Separator } from 'react-resizable-panels';
import { clearTerminal, formatDuration, useRunState, type RunStatus } from '../runner';
import { XTerm } from './XTerm';

const STATUS: Record<RunStatus, { color: string; label: string }> = {
  idle: { color: 'gray', label: 'Sẵn sàng' },
  running: { color: 'blue', label: 'Đang chạy' },
  ok: { color: 'teal', label: 'Xong' },
  error: { color: 'red', label: 'Lỗi' },
  stopped: { color: 'gray', label: 'Đã dừng' },
};

function StatusBadge() {
  const { status, durationMs } = useRunState();
  const s = STATUS[status];
  return (
    <Badge
      size="sm"
      variant="light"
      color={s.color}
      leftSection={status === 'running' ? <Loader size={10} color={s.color} /> : undefined}
    >
      {s.label}
      {durationMs !== undefined && status !== 'running' ? ` · ${formatDuration(durationMs)}` : ''}
    </Badge>
  );
}

function Preview({ url, port }: { url: string; port?: number }) {
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <div className="pane">
      <Group className="pane-toolbar" gap={6} wrap="nowrap">
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
          Preview
        </Text>
        <Text size="xs" c="dimmed" truncate style={{ flex: 1 }} title={url}>
          {port ? `:${port} — ` : ''}
          {url}
        </Text>
        <Tooltip label="Tải lại">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            <IconRefresh size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Mở tab mới (bấm “Connect to Project” ở tab đó)">
          <ActionIcon component="a" href={url} target="_blank" rel="noopener" variant="subtle" color="gray" size="sm">
            <IconExternalLink size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Đóng preview">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => useRunState.setState({ previewUrl: null })}>
            <IconX size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <iframe key={reloadKey} src={url} title="Preview" className="preview-frame" />
    </div>
  );
}

export function OutputPane() {
  const previewUrl = useRunState((s) => s.previewUrl);
  const previewPort = useRunState((s) => s.previewPort);

  const terminal = (
    <div className="pane">
      <Group className="pane-toolbar" gap={6} wrap="nowrap">
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
          Output
        </Text>
        <StatusBadge />
        <Tooltip label="Xoá output">
          <ActionIcon variant="subtle" color="gray" size="sm" ml="auto" onClick={clearTerminal} aria-label="Xoá output">
            <IconClearAll size={15} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <XTerm />
    </div>
  );

  return (
    <PanelGroup orientation="vertical" className="fill">
      <Panel id="terminal" minSize="15%">
        {terminal}
      </Panel>
      {previewUrl && (
        <>
          <Separator className="resize-handle" />
          <Panel id="preview" minSize="15%" defaultSize="55%">
            <Preview url={previewUrl} port={previewPort} />
          </Panel>
        </>
      )}
    </PanelGroup>
  );
}
