import {
	App,
	PluginSettingTab,
	Setting,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	Plugin,
	TFile,
	ToggleComponent,
	TextComponent,
} from "obsidian";

interface FrontmatterTagSuggestPluginSettings {
	addNewEntry: boolean;
	useSpaces: boolean;
	numSpaces: number;
}

const DEFAULT_SETTINGS: FrontmatterTagSuggestPluginSettings = {
	addNewEntry: true,
	useSpaces: true,
	numSpaces: 1,
}

export default class FrontmatterTagSuggestPlugin extends Plugin {
	settings: FrontmatterTagSuggestPluginSettings

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new Settings(this.app, this));
		this.registerEditorSuggest(new TagSuggest(this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class TagSuggest extends EditorSuggest<string> {
	plugin: FrontmatterTagSuggestPlugin;
	tags: string[];
	indent: string;

	constructor(plugin: FrontmatterTagSuggestPlugin) {
		super(plugin.app);
		this.plugin = plugin;

		const { useSpaces, numSpaces } = plugin.settings;
		this.indent = useSpaces ? (" ").repeat(numSpaces) : "\t";
	}

	getTags(): string[] {
		//@ts-expect-error, private method
		const tags: any = this.plugin.app.metadataCache.getTags();
		return [...Object.keys(tags)].map((p) => p.split("#").pop());
	}

	inRange(range: string) {
		if (!range || !range.length) return false;
		if (range.match(/^---\n/gm)?.length != 1) return false;
		if (!/^tags?:/gm.test(range)) return false;
		const split = range.split(/(^\w+:?\s*\n?)/gm);
		for (let i = split.length - 1; i >= 0; i--) {
			if (/(^\w+:?\s*\n?)/gm.test(split[i]))
				return split[i].startsWith("tags:");
		}
		return false;
	}
	inline = false;
	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		_: TFile
	): EditorSuggestTriggerInfo | null {
		const lineContents = editor.getLine(cursor.line).toLowerCase();
		const onFrontmatterTagLine =
			lineContents.startsWith("tags:") ||
			lineContents.startsWith("tag:") ||
			this.inRange(editor.getRange({ line: 0, ch: 0 }, cursor));
		if (onFrontmatterTagLine) {
			this.inline =
				lineContents.startsWith("tags:") ||
				lineContents.startsWith("tag:");
			const sub = editor.getLine(cursor.line).substring(0, cursor.ch);
			const match = sub.match(/(\S+)$/)?.first();
			if (match) {
				this.tags = this.getTags();
				const matchData = {
					end: cursor,
					start: {
						ch: sub.lastIndexOf(match),
						line: cursor.line,
					},
					query: match,
				};
				return matchData;
			}
		}
		return null;
	}

	getSuggestions(context: EditorSuggestContext): string[] {
		const suggestions = this.tags.filter((p) =>
			p.toLowerCase().contains(context.query.toLowerCase())
		);
		return suggestions;
	}

	renderSuggestion(suggestion: string, el: HTMLElement): void {
		const outer = el.createDiv({ cls: "ES-suggester-container" });
		outer.createDiv({ cls: "ES-tags" }).setText(`#${suggestion}`);
	}

	selectSuggestion(suggestion: string): void {
		if (this.context) {
			if (this.plugin.settings.addNewEntry) {
				if (this.inline) {
					suggestion = `${suggestion}, `;
				} else {
					suggestion = `${suggestion}\n${this.indent}-`;
				}
			}
			(this.context.editor as Editor).replaceRange(
				`${suggestion} `,
				this.context.start,
				this.context.end
			);
		}
	}
}

class Settings extends PluginSettingTab {
	plugin: FrontmatterTagSuggestPlugin;

	constructor(app: App, plugin: FrontmatterTagSuggestPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Automatically add another item in multi-line")
			.setDesc("When enabled, ")
			.addToggle((toggle: ToggleComponent) => toggle
				.setValue(this.plugin.settings.addNewEntry)
				.onChange(async (value: boolean) => {
					this.plugin.settings.addNewEntry = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Use Spaces for Indentation")
			.setDesc("If enabled, the next multi-line tag will be indented with spaces rather than a tab")
			.addToggle((toggle: ToggleComponent) => toggle
				.setValue(this.plugin.settings.useSpaces)
				.onChange(async (value: boolean) => {
					this.plugin.settings.useSpaces = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Number of Spaces for Indentation")
			.setDesc("If use spaces is enabled, this is the number of spaces that will be used for indentation")
			.addText((text: TextComponent) => text
				.setPlaceholder("1")
				.setValue("" + this.plugin.settings.numSpaces)
				.onChange(async (value: string) => {
					let num = parseInt(value, 10);
					if (isNaN(num)) return;
					this.plugin.settings.numSpaces = num;
					await this.plugin.saveSettings();
				})
			);
	}
}
