import { Badge, Button, Group, Radio, Select, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useState } from 'react';
import { RUNTIME_IDS, RUNTIME_INFO, runtimes } from '../runtimes';
import { useAppStore } from '../store/appStore';
import { projectFromTemplate } from '../store/projects';
import { templatesFor } from '../templates';
import type { RuntimeId } from '../types';

function NewProjectForm({ onDone }: { onDone: () => void }) {
  const [runtime, setRuntime] = useState<RuntimeId>('quickjs');
  const [templateId, setTemplateId] = useState(templatesFor('quickjs')[0].id);
  const [name, setName] = useState('');
  const templates = templatesFor(runtime);
  const template = templates.find((t) => t.id === templateId) ?? templates[0];

  const create = () => {
    const project = projectFromTemplate(template.id, name.trim() || template.name);
    useAppStore.getState().addProject(project);
    onDone();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <Stack gap="md">
        <Radio.Group
          label="Runtime"
          value={runtime}
          onChange={(v) => {
            const id = v as RuntimeId;
            setRuntime(id);
            setTemplateId(templatesFor(id)[0].id);
          }}
        >
          <Stack gap={6} mt={6}>
            {RUNTIME_IDS.map((id) => {
              const info = RUNTIME_INFO[id];
              const reason = runtimes[id].unavailableReason();
              return (
                <Radio.Card key={id} value={id} p="sm" radius="md" className="runtime-card">
                  <Group wrap="nowrap" align="flex-start">
                    <Radio.Indicator mt={2} />
                    <div style={{ flex: 1 }}>
                      <Group gap={6}>
                        <Text fw={600} size="sm">
                          {info.label}
                        </Text>
                        <Badge size="xs" variant="light" color={info.color}>
                          {info.short}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {info.description}
                      </Text>
                      {reason && (
                        <Text size="xs" c="orange" mt={4}>
                          ⚠ {reason}
                        </Text>
                      )}
                    </div>
                  </Group>
                </Radio.Card>
              );
            })}
          </Stack>
        </Radio.Group>

        <Select
          label="Template"
          value={template.id}
          onChange={(v) => v && setTemplateId(v)}
          data={templates.map((t) => ({ value: t.id, label: t.name }))}
          description={template.description}
          allowDeselect={false}
        />

        <TextInput
          data-autofocus
          label="Tên dự án"
          placeholder={template.name}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Huỷ
          </Button>
          <Button type="submit">Tạo dự án</Button>
        </Group>
      </Stack>
    </form>
  );
}

export function openNewProjectModal() {
  const id = modals.open({
    title: 'Dự án mới',
    size: 'lg',
    children: <NewProjectForm onDone={() => modals.close(id)} />,
  });
}
