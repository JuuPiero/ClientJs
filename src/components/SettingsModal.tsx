import { Button, Divider, Group, NumberInput, Progress, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconDownload, IconTrash, IconUpload } from '@tabler/icons-react';
import { exportAllProjects, importProjects, resetAllData } from '../lib/actions';
import { formatBytes } from '../lib/files';
import { useAppStore } from '../store/appStore';
import { useSaveState } from '../store/storage';

/** Quota localStorage phổ biến của các trình duyệt (không có API đọc chính xác). */
const QUOTA = 5 * 1024 * 1024;

function SettingsForm() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const bytes = useSaveState((s) => s.bytes);
  const projectCount = useAppStore((s) => Object.keys(s.projects).length);

  return (
    <Stack gap="md">
      <Text fw={600} size="sm">
        Thực thi (QuickJS · Web Worker)
      </Text>
      <SimpleGrid cols={2}>
        <NumberInput
          label="Thời gian chạy tối đa (giây)"
          min={1}
          max={600}
          value={settings.timeoutMs / 1000}
          onChange={(v) => update({ timeoutMs: Math.max(1, Number(v) || 1) * 1000 })}
        />
        <NumberInput
          label="Giới hạn bộ nhớ QuickJS (MB)"
          min={8}
          max={1024}
          value={settings.memoryLimitMb}
          onChange={(v) => update({ memoryLimitMb: Math.max(8, Number(v) || 8) })}
        />
      </SimpleGrid>

      <Divider />
      <Text fw={600} size="sm">
        Editor
      </Text>
      <Group grow align="flex-end">
        <NumberInput
          label="Cỡ chữ"
          min={10}
          max={28}
          value={settings.fontSize}
          onChange={(v) => update({ fontSize: Number(v) || 14 })}
        />
        <Stack gap={8}>
          <Switch label="Word wrap" checked={settings.wordWrap} onChange={(e) => update({ wordWrap: e.currentTarget.checked })} />
          <Switch label="Minimap" checked={settings.minimap} onChange={(e) => update({ minimap: e.currentTarget.checked })} />
        </Stack>
      </Group>

      <Divider />
      <Text fw={600} size="sm">
        Dữ liệu (localStorage)
      </Text>
      <div>
        <Group justify="space-between" mb={4}>
          <Text size="xs" c="dimmed">
            {projectCount} dự án · {formatBytes(bytes)} / ~{formatBytes(QUOTA)}
          </Text>
          <Text size="xs" c="dimmed">
            {((bytes / QUOTA) * 100).toFixed(1)}%
          </Text>
        </Group>
        <Progress value={(bytes / QUOTA) * 100} color={bytes / QUOTA > 0.8 ? 'red' : 'indigo'} />
      </div>
      <Group>
        <Button variant="default" leftSection={<IconDownload size={16} />} onClick={exportAllProjects}>
          Export tất cả
        </Button>
        <Button variant="default" leftSection={<IconUpload size={16} />} onClick={importProjects}>
          Import
        </Button>
        <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={resetAllData} ml="auto">
          Xoá toàn bộ
        </Button>
      </Group>
    </Stack>
  );
}

export function openSettingsModal() {
  modals.open({ title: 'Cài đặt', size: 'lg', children: <SettingsForm /> });
}
