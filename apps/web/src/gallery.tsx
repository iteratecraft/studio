// The kit gallery (M2-05): every component of @course-suite/ui on one page, in the light or dark
// theme and in English or a pseudo-language. `?theme=light|dark` and `?lang=<tag>` pick the
// starting state, so the browser tests can open each one directly.
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogTrigger,
  EmptyState,
  GridList,
  GridListItem,
  ICON_NAMES,
  Icon,
  IconButton,
  isRTL,
  ListBox,
  ListBoxItem,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Popover,
  ProgressBar,
  PSEUDO_LOCALES,
  SearchField,
  Select,
  Splitter,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextArea,
  TextField,
  ToastQueue,
  ToastRegion,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  ToolbarSeparator,
  Tree,
  TreeItem,
  UiProvider,
  useListData,
  useReorder,
  useStrings,
} from "@course-suite/ui";
import { type ReactNode, useEffect, useState } from "react";

const THEMES = ["system", "light", "dark"] as const;
type Theme = (typeof THEMES)[number];
const LANGUAGES = [
  { id: "en", name: "English" },
  { id: PSEUDO_LOCALES[0], name: "Pseudo, longer text" },
  { id: PSEUDO_LOCALES[1], name: "Pseudo, right to left" },
];

const toasts = new ToastQueue({ maxVisibleToasts: 3 });

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="gallery-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

function ReorderableLessons() {
  const t = useStrings();
  const lessons = useListData({
    initialItems: [
      { id: "welcome", name: "Welcome" },
      { id: "soil", name: "Healthy soil" },
      { id: "compost", name: "Making compost" },
      { id: "quiz", name: "Final quiz" },
    ],
  });
  const dragAndDropHooks = useReorder(lessons, (lesson) => lesson.name);
  return (
    <>
      <GridList
        aria-label="Lessons"
        items={lessons.items}
        selectionMode="multiple"
        dragAndDropHooks={dragAndDropHooks}
      >
        {(lesson) => <GridListItem>{lesson.name}</GridListItem>}
      </GridList>
      <p className="gallery-note">{t("list.items", { count: lessons.items.length })}</p>
    </>
  );
}

export function Gallery() {
  const params = new URLSearchParams(location.search);
  const [theme, setTheme] = useState<Theme>(() => {
    const asked = params.get("theme");
    return THEMES.find((name) => name === asked) ?? "system";
  });
  const [locale, setLocale] = useState(() => params.get("lang") ?? "en");

  useEffect(() => {
    const html = document.documentElement;
    if (theme === "system") delete html.dataset.theme;
    else html.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRTL(locale) ? "rtl" : "ltr";
  }, [locale]);

  return (
    <UiProvider locale={locale}>
      <header className="gallery-header">
        <h1>UI kit</h1>
        <div className="gallery-settings">
          <Select
            label="Theme"
            selectedKey={theme}
            onSelectionChange={(key) => setTheme(key as Theme)}
          >
            <ListBoxItem id="system">System</ListBoxItem>
            <ListBoxItem id="light">Light</ListBoxItem>
            <ListBoxItem id="dark">Dark</ListBoxItem>
          </Select>
          <Select
            label="Language"
            items={LANGUAGES}
            selectedKey={locale}
            onSelectionChange={(key) => setLocale(String(key))}
          >
            {(language) => <ListBoxItem>{language.name}</ListBoxItem>}
          </Select>
        </div>
      </header>
      <main className="gallery">
        <Section id="buttons" title="Buttons">
          <div className="gallery-row">
            <Button variant="primary">Publish</Button>
            <Button>Preview</Button>
            <Button variant="quiet">Cancel</Button>
            <Button variant="danger">Delete</Button>
            <Button isDisabled>Disabled</Button>
          </div>
          <div className="gallery-row">
            <IconButton icon="add" label="Add a lesson" />
            <IconButton icon="edit" label="Rename" />
            <IconButton icon="trash" label="Delete" variant="secondary" />
          </div>
        </Section>

        <Section id="toolbar" title="Toolbar">
          <Toolbar aria-label="Edit">
            <IconButton icon="undo" label="Undo" />
            <IconButton icon="redo" label="Redo" />
            <ToolbarSeparator />
            <IconButton icon="add" label="Add a block" />
            <IconButton icon="search" label="Find" />
          </Toolbar>
        </Section>

        <Section id="text-fields" title="Text fields">
          <TextField label="Course title" description="Shown on the cover page." />
          <TextField
            label="Lesson title"
            isRequired
            isInvalid
            errorMessage="Give the lesson a title."
          />
          <TextArea label="Description" placeholder="What learners will get from it" />
        </Section>

        <Section id="search-field" title="Search field">
          <SearchField label="Search by title" defaultValue="Safety" />
        </Section>

        <Section id="toggle-buttons" title="Toggle buttons">
          <ToggleButtonGroup
            aria-label="Device"
            selectionMode="single"
            disallowEmptySelection
            defaultSelectedKeys={["computer"]}
          >
            <ToggleButton id="computer" icon="computer" label="Computer" />
            <ToggleButton id="tablet" icon="tablet" label="Tablet" />
            <ToggleButton id="phone" icon="phone" label="Phone" />
          </ToggleButtonGroup>
        </Section>

        <Section id="checkboxes" title="Checkbox and switch">
          <div className="gallery-column">
            <Checkbox defaultSelected>Show lesson numbers</Checkbox>
            <Checkbox isIndeterminate>Some lessons are required</Checkbox>
            <Switch defaultSelected>Autosave</Switch>
            <Switch isDisabled>Sync with a server</Switch>
          </div>
        </Section>

        <Section id="select" title="Select">
          <Select label="Block width" defaultSelectedKey="medium">
            <ListBoxItem id="small">Small</ListBoxItem>
            <ListBoxItem id="medium">Medium</ListBoxItem>
            <ListBoxItem id="large">Large</ListBoxItem>
          </Select>
        </Section>

        <Section id="menu" title="Menu">
          <MenuTrigger>
            <IconButton icon="more" label="Lesson actions" variant="secondary" />
            <Menu>
              <MenuItem>Duplicate</MenuItem>
              <MenuItem>Copy to another course</MenuItem>
              <MenuItem>Change icon</MenuItem>
              <MenuSeparator />
              <MenuItem isDanger>Delete</MenuItem>
            </Menu>
          </MenuTrigger>
        </Section>

        <Section id="tabs" title="Tabs">
          <Tabs>
            <TabList aria-label="Block settings">
              <Tab id="content">Content</Tab>
              <Tab id="format">Format</Tab>
              <Tab id="labels">Labels</Tab>
            </TabList>
            <TabPanel id="content">The text and media of the block.</TabPanel>
            <TabPanel id="format">Colours, spacing and width.</TabPanel>
            <TabPanel id="labels">Words learners see on buttons.</TabPanel>
          </Tabs>
        </Section>

        <Section id="dialogs" title="Dialog and popover">
          <div className="gallery-row">
            <DialogTrigger>
              <Button>Rename lesson</Button>
              <Dialog title="Rename lesson">
                {(close) => (
                  <>
                    <TextField label="Lesson title" defaultValue="Healthy soil" autoFocus />
                    <DialogActions>
                      <Button variant="quiet" onPress={close}>
                        Cancel
                      </Button>
                      <Button variant="primary" onPress={close}>
                        Save
                      </Button>
                    </DialogActions>
                  </>
                )}
              </Dialog>
            </DialogTrigger>
            <DialogTrigger>
              <Button>Lesson details</Button>
              <Popover label="Lesson details">
                <p className="gallery-note">12 blocks, last changed today.</p>
                <Checkbox>Required for completion</Checkbox>
              </Popover>
            </DialogTrigger>
          </div>
        </Section>

        <Section id="toasts" title="Toast">
          <div className="gallery-row">
            <Button
              onPress={() =>
                toasts.add(
                  {
                    title: "Lesson deleted",
                    action: {
                      label: "Undo",
                      onAction: () => toasts.add({ title: "Lesson restored" }, { timeout: 5000 }),
                    },
                  },
                  { timeout: 8000 },
                )
              }
            >
              Delete a lesson
            </Button>
            <Button
              onPress={() =>
                toasts.add({ title: "Saved", description: "All changes are on disk." })
              }
            >
              Show a notice
            </Button>
          </div>
        </Section>

        <Section id="list-box" title="List box">
          <ListBox aria-label="Label language" selectionMode="single" defaultSelectedKeys={["en"]}>
            <ListBoxItem id="de">German</ListBoxItem>
            <ListBoxItem id="en">English</ListBoxItem>
            <ListBoxItem id="es">Spanish</ListBoxItem>
            <ListBoxItem id="fr">French</ListBoxItem>
            <ListBoxItem id="pt">Portuguese</ListBoxItem>
          </ListBox>
        </Section>

        <Section id="grid-list" title="Reorderable list">
          <ReorderableLessons />
        </Section>

        <Section id="tree" title="Tree">
          <Tree aria-label="Course outline" defaultExpandedKeys={["basics"]}>
            <TreeItem id="basics" title="Basics">
              <TreeItem id="welcome" title="Welcome" />
              <TreeItem id="soil" title="Healthy soil" />
            </TreeItem>
            <TreeItem id="practice" title="Practice">
              <TreeItem id="compost" title="Making compost" />
            </TreeItem>
            <TreeItem id="quiz" title="Final quiz" />
          </Tree>
        </Section>

        <Section id="splitter" title="Splitter">
          <Splitter label="Resize the outline" className="gallery-splitter">
            <p className="gallery-pane">Outline</p>
            <p className="gallery-pane">Lesson</p>
          </Splitter>
        </Section>

        <Section id="empty-state" title="Empty state">
          <EmptyState
            icon="file"
            title="No lessons yet"
            level={3}
            action={<Button variant="primary">Add a lesson</Button>}
          >
            Lessons you add show up here.
          </EmptyState>
        </Section>

        <Section id="progress" title="Progress bar">
          <div className="gallery-column">
            <ProgressBar label="Exporting the course" value={40} />
            <ProgressBar label="Preparing the preview" isIndeterminate />
          </div>
        </Section>

        <Section id="icons" title="Icons">
          <ul className="gallery-icons">
            {ICON_NAMES.map((name) => (
              <li key={name}>
                <Icon name={name} size={20} />
                <span>{name}</span>
              </li>
            ))}
          </ul>
        </Section>
      </main>
      <ToastRegion queue={toasts} />
    </UiProvider>
  );
}
