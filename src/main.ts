import {
	ItemView,
	MarkdownFileInfo,
	MarkdownView,
	Notice,
	Plugin,
	Setting,
	TFile,
	WorkspaceLeaf,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	MyPluginSettings,
	SampleSettingTab,
} from './settings';

const PROPSYNC_KEY = 'propsync';
const PROPSYNC_VIEW_TYPE = 'propsync-view';

type PropsyncGroupMap = Map<string, TFile[]>;

export default class MyPlugin extends Plugin {
	settings!: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(
			PROPSYNC_VIEW_TYPE,
			(leaf) => new PropsyncView(leaf),
		);

		this.app.workspace.onLayoutReady(async () => {
			await this.ensurePropsyncTabExists();
		});

		this.addCommand({
			id: 'open-propsync-menu',
			name: 'Propsync Menü öffnen',
			callback: async () => {
				await this.activatePropsyncView();
			},
		});

		this.addCommand({
			id: 'open-propsync-menu-from-editor',
			name: 'Propsync Menü öffnen',
			editorCallback: async (
				_editor,
				_ctx: MarkdownView | MarkdownFileInfo,
			) => {
				await this.activatePropsyncView();
			},
		});

		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	async ensurePropsyncTabExists() {
		const existingLeaves = this.app.workspace.getLeavesOfType(PROPSYNC_VIEW_TYPE);

		if (existingLeaves.length > 0) {
			return;
		}

		const leaf = this.app.workspace.getLeftLeaf(false);

		if (!leaf) {
			new Notice('Propsync konnte keinen linken Tab erstellen.');
			return;
		}

		await leaf.setViewState({ type: PROPSYNC_VIEW_TYPE, active: false });
	}

	async activatePropsyncView() {
		await this.ensurePropsyncTabExists();

		const existingLeaves = this.app.workspace.getLeavesOfType(PROPSYNC_VIEW_TYPE);

		const leaf = existingLeaves[0];

		if (leaf) {
			this.app.workspace.revealLeaf(leaf);
		}
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MyPluginSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class PropsyncView extends ItemView {
	private groups: PropsyncGroupMap = new Map();
	private selectedGroup = '';
	private propertyListEl: HTMLElement | null = null;
	private fileListEl: HTMLElement | null = null;
	private propertyText = '';

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return PROPSYNC_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Propsync';
	}

	getIcon(): string {
		return 'list-checks';
	}

	async onOpen() {
		this.registerEvent(
			this.app.metadataCache.on('changed', () => {
				this.render();
			}),
		);

		this.render();
	}

	async onClose() {}

	private render() {
		const container = this.contentEl;
		container.empty();
		container.createEl('h2', { text: 'Propsync' });
		container.createEl('p', {
			text: 'Wähle eine Gruppe aus. Darunter werden alle Properties angezeigt, die in allen Dateien dieser Gruppe vorhanden sind.',
		});

		this.groups = this.collectPropsyncGroups();

		if (this.groups.size === 0) {
			container.createEl('p', {
				text: 'Keine Markdown Dateien mit propsync Property gefunden.',
			});
			return;
		}

		if (!this.selectedGroup || !this.groups.has(this.selectedGroup)) {
			const firstGroup = Array.from(this.groups.keys())[0];

			if (!firstGroup) {
				container.createEl('p', {
					text: 'Keine propsync Gruppe gefunden.',
				});
				return;
			}

			this.selectedGroup = firstGroup;
		}

		new Setting(container)
			.setName('Gruppe')
			.setDesc('Alle Dateien mit demselben propsync Wert werden als Gruppe behandelt.')
			.addDropdown((dropdown) => {
				for (const groupName of this.groups.keys()) {
					dropdown.addOption(groupName, groupName);
				}

				dropdown.setValue(this.selectedGroup);
				dropdown.onChange((value) => {
					this.selectedGroup = value;
					this.renderSelectedGroup();
				});
			});

		this.propertyListEl = container.createDiv();
		this.fileListEl = container.createDiv();

		new Setting(container)
			.setName('Neue Standard Properties')
			.setDesc('Eine Property pro Zeile. Diese Properties werden ohne Wert ergänzt, wenn sie fehlen.')
			.addTextArea((textArea) => {
				textArea
					.setPlaceholder('name\nalias\nberuf\nstatus')
					.setValue(this.propertyText)
					.onChange((value) => {
						this.propertyText = value;
					});

				textArea.inputEl.rows = 8;
				textArea.inputEl.cols = 28;
			});

		new Setting(container)
			.setName('Synchronisieren')
			.setDesc('Fügt fehlende Properties hinzu. Vorhandene Werte werden nicht überschrieben.')
			.addButton((button) => {
				button
					.setButtonText('Auf Gruppe syncen')
					.setCta()
					.onClick(async () => {
						const files = this.groups.get(this.selectedGroup) ?? [];
						const properties = this.parsePropertyNames(this.propertyText);

						if (properties.length === 0) {
							new Notice('Bitte mindestens eine Property eintragen.');
							return;
						}

						const changedFiles = await this.syncPropertiesToFiles(files, properties);
						new Notice(
							`Propsync abgeschlossen: ${changedFiles} von ${files.length} Dateien angepasst.`,
						);

						this.groups = this.collectPropsyncGroups();
						this.renderSelectedGroup();
					});
			});

		this.renderSelectedGroup();
	}

	private renderSelectedGroup() {
		if (!this.propertyListEl || !this.fileListEl) {
			return;
		}

		const files = this.groups.get(this.selectedGroup) ?? [];
		const sharedProperties = this.collectSharedProperties(files);

		this.propertyListEl.empty();
		this.propertyListEl.createEl('h3', {
			text: `Gemeinsame Properties: ${this.selectedGroup}`,
		});

		if (sharedProperties.length === 0) {
			this.propertyListEl.createEl('p', {
				text: 'Keine Properties gefunden, die in allen Dateien dieser Gruppe vorhanden sind.',
			});
		} else {
			const propertyList = this.propertyListEl.createEl('ul');
			for (const propertyName of sharedProperties) {
				propertyList.createEl('li', { text: propertyName });
			}
		}

		this.fileListEl.empty();
		this.fileListEl.createEl('h3', {
			text: `Dateien: ${files.length}`,
		});

		const fileList = this.fileListEl.createEl('ul');
		for (const file of files) {
			fileList.createEl('li', { text: file.path });
		}
	}

	private collectPropsyncGroups(): PropsyncGroupMap {
		const result: PropsyncGroupMap = new Map();
		const markdownFiles = this.app.vault.getMarkdownFiles();
		const metadataCache = this.app.metadataCache;

		for (const file of markdownFiles) {
			const cache = metadataCache.getFileCache(file);
			const frontmatter = cache?.frontmatter;
			const groupValue = frontmatter?.[PROPSYNC_KEY];

			if (typeof groupValue !== 'string' || groupValue.trim().length === 0) {
				continue;
			}

			const groupName = groupValue.trim();
			const files = result.get(groupName) ?? [];
			files.push(file);
			result.set(groupName, files);
		}

		return result;
	}

	private collectSharedProperties(files: TFile[]): string[] {
		if (files.length === 0) {
			return [];
		}

		const metadataCache = this.app.metadataCache;
		const firstFile = files[0];

		if (!firstFile) {
			return [];
		}

		const firstFrontmatter = metadataCache.getFileCache(firstFile)?.frontmatter;

		if (!firstFrontmatter) {
			return [];
		}

		let sharedProperties = new Set(Object.keys(firstFrontmatter));

		for (const file of files.slice(1)) {
			const frontmatter = metadataCache.getFileCache(file)?.frontmatter;
			const propertyNames = new Set(Object.keys(frontmatter ?? {}));

			sharedProperties = new Set(
				Array.from(sharedProperties).filter((propertyName) =>
					propertyNames.has(propertyName),
				),
			);
		}

		return Array.from(sharedProperties).sort((a, b) => a.localeCompare(b));
	}

	private parsePropertyNames(value: string): string[] {
		const seen = new Set<string>();
		const properties: string[] = [];

		for (const line of value.split('\n')) {
			const propertyName = line.trim();

			if (propertyName.length === 0) {
				continue;
			}

			if (propertyName.includes(':')) {
				continue;
			}

			if (seen.has(propertyName)) {
				continue;
			}

			seen.add(propertyName);
			properties.push(propertyName);
		}

		return properties;
	}

	private async syncPropertiesToFiles(files: TFile[], properties: string[]): Promise<number> {
		let changedFiles = 0;

		for (const file of files) {
			const didChange = await this.syncPropertiesToFile(file, properties);

			if (didChange) {
				changedFiles += 1;
			}
		}

		return changedFiles;
	}

	private async syncPropertiesToFile(file: TFile, properties: string[]): Promise<boolean> {
		let didChange = false;

		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			for (const propertyName of properties) {
				if (Object.prototype.hasOwnProperty.call(frontmatter, propertyName)) {
					continue;
				}

				frontmatter[propertyName] = null;
				didChange = true;
			}
		});

		return didChange;
	}
}
