import Editor, { type OnMount } from '@monaco-editor/react';
import { Center, CloseButton, Group, Loader, ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCode } from '@tabler/icons-react';
import { modelUri, pathFromUri } from '../monaco';
import { runCurrent } from '../runner';
import { useAppStore, useCurrentProject } from '../store/appStore';
import { languageOf } from '../store/projects';
import { flushStorage } from '../store/storage';

const handleMount: OnMount = (editor, monaco) => {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runCurrent());
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    flushStorage();
    notifications.show({ message: 'Đã lưu vào localStorage', autoClose: 1200 });
  });
  // Lấy path từ URI của model => luôn ghi đúng file kể cả khi vừa đổi tab.
  editor.onDidChangeModelContent(() => {
    const model = editor.getModel();
    if (!model) return;
    const { projectId, path } = pathFromUri(model.uri);
    const s = useAppStore.getState();
    if (projectId === s.currentId) s.updateFile(path, model.getValue());
  });
};

export function EditorPane() {
  const project = useCurrentProject();
  const settings = useAppStore((s) => s.settings);
  const openFile = useAppStore((s) => s.openFile);
  const closeFile = useAppStore((s) => s.closeFile);

  if (!project) {
    return (
      <Center h="100%">
        <Text c="dimmed">Chưa có dự án nào — tạo mới ở sidebar.</Text>
      </Center>
    );
  }

  const active = project.activeFile;

  return (
    <Stack gap={0} h="100%" className="editor-pane">
      <ScrollArea type="never" className="tabbar">
        <Group gap={0} wrap="nowrap">
          {project.openFiles.map((path) => (
            <Group
              key={path}
              gap={4}
              wrap="nowrap"
              className="tab"
              data-active={path === active || undefined}
              onAuxClick={(e) => e.button === 1 && closeFile(path)}
            >
              <UnstyledButton onClick={() => openFile(path)} className="tab-label" title={path}>
                <Text size="sm" span>
                  {path.split('/').pop()}
                </Text>
                {path === project.entry && (
                  <Text span size="xs" c="teal" ml={4}>
                    ▶
                  </Text>
                )}
              </UnstyledButton>
              <CloseButton size="xs" onClick={() => closeFile(path)} aria-label={`Đóng ${path}`} />
            </Group>
          ))}
        </Group>
      </ScrollArea>

      <div className="editor-host">
        {active ? (
          <Editor
            theme="vs-dark"
            path={modelUri(project.id, active)}
            defaultValue={project.files[active] ?? ''}
            defaultLanguage={languageOf(active)}
            onMount={handleMount}
            loading={<Loader size="sm" />}
            options={{
              fontSize: settings.fontSize,
              fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
              minimap: { enabled: settings.minimap },
              wordWrap: settings.wordWrap ? 'on' : 'off',
              tabSize: 2,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 8 },
              fixedOverflowWidgets: true,
            }}
          />
        ) : (
          <Center h="100%">
            <Stack align="center" gap={4}>
              <IconCode size={36} color="var(--mantine-color-dark-3)" />
              <Text c="dimmed" size="sm">
                Chọn file bên trái để mở
              </Text>
            </Stack>
          </Center>
        )}
      </div>
    </Stack>
  );
}
