import { Group, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCircleCheck, IconCloudUpload, IconLock, IconLockOpen } from '@tabler/icons-react';
import { useEffect } from 'react';
import { formatBytes } from '../lib/files';
import { RUNTIME_INFO } from '../runtimes';
import { useAppStore } from '../store/appStore';
import { useSaveState } from '../store/storage';

export function StatusBar() {
  const save = useSaveState();
  const runtime = useAppStore((s) => (s.currentId ? s.projects[s.currentId]?.runtime : undefined));
  const isolated = globalThis.crossOriginIsolated;

  useEffect(() => {
    if (save.status === 'error') {
      notifications.show({ id: 'storage-error', color: 'red', title: 'Không lưu được', message: save.error, autoClose: 8000 });
    }
  }, [save.status, save.error]);

  return (
    <Group h="100%" px="sm" gap="md" wrap="nowrap" className="statusbar">
      <Tooltip
        label={
          isolated
            ? 'Cross-origin isolated: WebContainer & SharedArrayBuffer dùng được'
            : 'Chưa cross-origin isolated: WebContainer không chạy được (xem README)'
        }
        multiline
        w={300}
      >
        <Group gap={4} wrap="nowrap">
          {isolated ? <IconLock size={12} /> : <IconLockOpen size={12} color="var(--mantine-color-orange-5)" />}
          <Text size="xs">{isolated ? 'COOP/COEP ✓' : 'COOP/COEP ✗'}</Text>
        </Group>
      </Tooltip>

      {runtime && (
        <Text size="xs" truncate visibleFrom="sm">
          {RUNTIME_INFO[runtime].description}
        </Text>
      )}

      <Group gap={4} ml="auto" wrap="nowrap">
        {save.status === 'pending' && <IconCloudUpload size={12} />}
        {save.status === 'saved' && <IconCircleCheck size={12} />}
        {save.status === 'error' && <IconAlertTriangle size={12} color="var(--mantine-color-red-5)" />}
        <Text size="xs">
          {save.status === 'error' ? 'Lỗi lưu' : save.status === 'pending' ? 'Đang lưu…' : 'Đã lưu'} · localStorage{' '}
          {formatBytes(save.bytes)}
        </Text>
      </Group>
    </Group>
  );
}
