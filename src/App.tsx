import { AppShell } from '@mantine/core';
import { useDisclosure, useHotkeys, useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useEffect } from 'react';
import { Group as PanelGroup, Panel, Separator, useDefaultLayout, type LayoutStorage } from 'react-resizable-panels';
import { EditorPane } from './components/EditorPane';
import { FileTree } from './components/FileTree';
import { Header } from './components/Header';
import { OutputPane } from './components/OutputPane';
import { ProjectList } from './components/ProjectList';
import { StatusBar } from './components/StatusBar';
import { setWasmTypings } from './monaco';
import { runCurrent } from './runner';
import { getWasmManifest } from './runtimes/workerRuntime';
import { useAppStore } from './store/appStore';
import { flushStorage } from './store/storage';

// Kích thước các panel cũng được nhớ trong localStorage (bọc try/catch).
const layoutStorage: LayoutStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* bỏ qua */
    }
  },
};

function Workspace({ vertical }: { vertical: boolean }) {
  const orientation = vertical ? 'vertical' : 'horizontal';
  const layout = useDefaultLayout({ id: `clientjs:layout:${orientation}`, storage: layoutStorage });
  return (
    <PanelGroup
      key={orientation}
      orientation={orientation}
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
      className="fill"
    >
      <Panel id="editor" minSize="20%" defaultSize="58%">
        <EditorPane />
      </Panel>
      <Separator className="resize-handle" />
      <Panel id="output" minSize="15%">
        <OutputPane />
      </Panel>
    </PanelGroup>
  );
}

export function App() {
  const isMobile = useMediaQuery('(max-width: 48em)') ?? false;
  const [mobileNav, { toggle: toggleMobileNav, close: closeMobileNav }] = useDisclosure(false);
  const sidebarOpen = useAppStore((s) => s.settings.sidebarOpen);
  const updateSettings = useAppStore((s) => s.updateSettings);

  useHotkeys([
    ['mod+Enter', () => runCurrent()],
    [
      'mod+S',
      () => {
        flushStorage();
        notifications.show({ message: 'Đã lưu vào localStorage', autoClose: 1200 });
      },
    ],
  ]);

  useEffect(() => {
    getWasmManifest().then(setWasmTypings);
  }, []);

  return (
    <AppShell
      header={{ height: 48 }}
      footer={{ height: 26 }}
      navbar={{ width: 272, breakpoint: 'sm', collapsed: { mobile: !mobileNav, desktop: !sidebarOpen } }}
      padding={0}
    >
      <AppShell.Header>
        <Header
          sidebarOpen={isMobile ? mobileNav : sidebarOpen}
          onToggleSidebar={() => (isMobile ? toggleMobileNav() : updateSettings({ sidebarOpen: !sidebarOpen }))}
        />
      </AppShell.Header>

      <AppShell.Navbar className="sidebar">
        <AppShell.Section>
          <ProjectList onNavigate={closeMobileNav} />
        </AppShell.Section>
        <AppShell.Section grow className="sidebar-files">
          <FileTree />
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main className="main">
        <Workspace vertical={isMobile} />
      </AppShell.Main>

      <AppShell.Footer>
        <StatusBar />
      </AppShell.Footer>
    </AppShell>
  );
}
