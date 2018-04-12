/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

const util = require("util");
const SortableSet = require("./util/SortableSet");
const GraphHelpers = require("./GraphHelpers");
let debugId = 1000;
const ERR_CHUNK_ENTRY = "Chunk.entry was removed. Use hasRuntime()";
const ERR_CHUNK_INITIAL =
	"Chunk.initial was removed. Use canBeInitial/isOnlyInitial()";

const sortById = (a, b) => {
	if (a.id < b.id) return -1;
	if (b.id < a.id) return 1;
	return 0;
};

const sortByIdentifier = (a, b) => {
	if (a.identifier() > b.identifier()) return 1;
	if (a.identifier() < b.identifier()) return -1;
	return 0;
};

const getModulesIdent = set => {
	set.sort();
	let str = "";
	for (const m of set) {
		str += m.identifier() + "#";
	}
	return str;
};

const getArray = set => Array.from(set);

const getModulesSize = set => {
	let count = 0;
	for (const module of set) {
		count += module.size();
	}
	return count;
};

/**
 * @class
 * @name Chunk
 * @description A Chunk is a unit of encapsulation for Modules.
 * Chunks are "rendered" into bundles that get emitted when the build completes.
 */
class Chunk {
	/**
	 * @param {string} name Name of chunk being created
	 */
	constructor(name) {
		this.id = null;
		this.ids = null;
		this.debugId = debugId++;
		this.name = name;
		this.entryModule = undefined;
		this._modules = new SortableSet(undefined, sortByIdentifier);
		this._groups = new SortableSet(undefined, sortById);
		this.files = [];
		this.rendered = false;
		this.hash = undefined;
		this.contentHash = Object.create(null);
		this.renderedHash = undefined;
		this.chunkReason = undefined;
		this.extraAsync = false;
	}

	/**
	 * @deprecated Chunk.entry has been deprecated. Please use .hasRuntime() instead
	 * @return {never} Throws an error trying to access this property
	 */
	get entry() {
		throw new Error(ERR_CHUNK_ENTRY);
	}

	/**
	 * @deprecated .entry has been deprecated. Please use .hasRuntime() instead
	 * @param {never} data The data that was attempting to be set
	 * @return {never} Throws an error trying to access this property
	 */
	set entry(data) {
		throw new Error(ERR_CHUNK_ENTRY);
	}

	/**
	 * @deprecated Chunk.initial was removed. Use canBeInitial/isOnlyInitial()
	 * @return {never} Throws an error trying to access this property
	 */
	get initial() {
		throw new Error(ERR_CHUNK_INITIAL);
	}

	/**
	 * @deprecated Chunk.initial was removed. Use canBeInitial/isOnlyInitial()
	 * @param {never} data The data attempting to be set
	 * @return {never} Throws an error trying to access this property
	 */
	set initial(data) {
		throw new Error(ERR_CHUNK_INITIAL);
	}

	/**
	 * @return {boolean} whether or not the Chunk will have a runtime
	 */
	hasRuntime() {
		for (const chunkGroup of this._groups) {
			// We only need to check the first one
			return chunkGroup.isInitial() && chunkGroup.getRuntimeChunk() === this;
		}
		return false;
	}

	/**
	 * @return {boolean} whether or not this chunk can be an initial chunk
	 */
	canBeInitial() {
		for (const chunkGroup of this._groups) {
			if (chunkGroup.isInitial()) return true;
		}
		return false;
	}

	/**
	 * @return {boolean} whether this chunk can only be an initial chunk
	 */
	isOnlyInitial() {
		if (this._groups.size <= 0) return false;
		for (const chunkGroup of this._groups) {
			if (!chunkGroup.isInitial()) return false;
		}
		return true;
	}

	/**
	 * @return {boolean} if this chunk contains the entry module
	 */
	hasEntryModule() {
		return !!this.entryModule;
	}

	//TODO: Use actual Module type instead of "faked"
	//Blocked by https://github.com/Microsoft/TypeScript/issues/23375
	/** @typedef {typeof import("./Module.js")} Module */
	/** @typedef {typeof import("./ChunkGroup")} ChunkGroup */

	/**
	 * @param {Module} module the module that will be added to this chunk.
	 * @return {boolean} returns true if the chunk doesn't have the module and it was added
	 */
	addModule(module) {
		if (!this._modules.has(module)) {
			this._modules.add(module);
			return true;
		}
		return false;
	}

	//TODO: Change any to Module when valid type
	/**
	 * @param {any} module the module that will be removed from this chunk
	 * @return {boolean} returns true if chunk exists and is successfully deleted
	 */
	removeModule(module) {
		if (this._modules.delete(module)) {
			module.removeChunk(this);
			return true;
		}
		return false;
	}

	//TODO: Change any[] to Module[] when valid type
	/**
	 * @return {void} set new modules to this chunk and return nothing
	 * @param {any[]} modules the new modules to be set
	 */
	setModules(modules) {
		this._modules = new SortableSet(modules, sortByIdentifier);
	}

	/**
	 * @return {number} the amount of modules in chunk
	 */
	getNumberOfModules() {
		return this._modules.size;
	}

	/**
	 * @return {SortableSet} return the modules SortableSet for this chunk
	 */
	get modulesIterable() {
		return this._modules;
	}

	/**
	 * @param {ChunkGroup} chunkGroup the chunkGroup the chunk is being added
	 * @return {boolean} returns true if chunk is not apart of chunkGroup and is added successfully
	 */
	addGroup(chunkGroup) {
		if (this._groups.has(chunkGroup)) return false;
		this._groups.add(chunkGroup);
		return true;
	}

	/**
	 * @param {ChunkGroup} chunkGroup the chunkGroup the chunk is being removed from
	 * @return {boolean} returns true if chunk does exist in chunkGroup and is removed
	 */
	removeGroup(chunkGroup) {
		if (!this._groups.has(chunkGroup)) return false;
		this._groups.delete(chunkGroup);
		return true;
	}

	/**
	 * @param {ChunkGroup} chunkGroup the chunkGroup to check
	 * @return {boolean} returns true if chunk has chunkGroup reference and exists in chunkGroup
	 */
	isInGroup(chunkGroup) {
		return this._groups.has(chunkGroup);
	}

	/**
	 * @return {number} the amount of groups said chunk is in
	 */
	getNumberOfGroups() {
		return this._groups.size;
	}

	/**
	 * @return {SortableSet} the chunkGroups that said chunk is referenced in
	 */
	get groupsIterable() {
		return this._groups;
	}

	compareTo(otherChunk) {
		this._modules.sort();
		otherChunk._modules.sort();
		if (this._modules.size > otherChunk._modules.size) return -1;
		if (this._modules.size < otherChunk._modules.size) return 1;
		const a = this._modules[Symbol.iterator]();
		const b = otherChunk._modules[Symbol.iterator]();
		// eslint-disable-next-line
		while (true) {
			const aItem = a.next();
			const bItem = b.next();
			if (aItem.done) return 0;
			const aModuleIdentifier = aItem.value.identifier();
			const bModuleIdentifier = bItem.value.identifier();
			if (aModuleIdentifier > bModuleIdentifier) return -1;
			if (aModuleIdentifier < bModuleIdentifier) return 1;
		}
	}

	containsModule(module) {
		return this._modules.has(module);
	}

	getModules() {
		return this._modules.getFromCache(getArray);
	}

	getModulesIdent() {
		return this._modules.getFromUnorderedCache(getModulesIdent);
	}

	remove(reason) {
		// cleanup modules
		// Array.from is used here to create a clone, because removeChunk modifies this._modules
		for (const module of Array.from(this._modules)) {
			module.removeChunk(this);
		}
		for (const chunkGroup of this._groups) {
			chunkGroup.removeChunk(this);
		}
	}

	moveModule(module, otherChunk) {
		GraphHelpers.disconnectChunkAndModule(this, module);
		GraphHelpers.connectChunkAndModule(otherChunk, module);
		module.rewriteChunkInReasons(this, [otherChunk]);
	}

	integrate(otherChunk, reason) {
		if (!this.canBeIntegrated(otherChunk)) {
			return false;
		}

		// Array.from is used here to create a clone, because moveModule modifies otherChunk._modules
		for (const module of Array.from(otherChunk._modules)) {
			otherChunk.moveModule(module, this);
		}
		otherChunk._modules.clear();

		for (const chunkGroup of otherChunk._groups) {
			chunkGroup.replaceChunk(otherChunk, this);
			this.addGroup(chunkGroup);
		}
		otherChunk._groups.clear();

		if (this.name && otherChunk.name) {
			if (this.name.length !== otherChunk.name.length)
				this.name =
					this.name.length < otherChunk.name.length
						? this.name
						: otherChunk.name;
			else
				this.name = this.name < otherChunk.name ? this.name : otherChunk.name;
		}

		return true;
	}

	split(newChunk) {
		for (const chunkGroup of this._groups) {
			chunkGroup.insertChunk(newChunk, this);
			newChunk.addGroup(chunkGroup);
		}
	}

	isEmpty() {
		return this._modules.size === 0;
	}

	updateHash(hash) {
		hash.update(`${this.id} `);
		hash.update(this.ids ? this.ids.join(",") : "");
		hash.update(`${this.name || ""} `);
		for (const m of this._modules) {
			hash.update(m.hash);
		}
	}

	canBeIntegrated(otherChunk) {
		const isAvailable = (a, b) => {
			const queue = new Set(b.groupsIterable);
			for (const chunkGroup of queue) {
				if (a.isInGroup(chunkGroup)) continue;
				if (chunkGroup.isInitial()) return false;
				for (const parent of chunkGroup.parentsIterable) queue.add(parent);
			}
			return true;
		};
		if (this.hasRuntime() !== otherChunk.hasRuntime()) {
			if (this.hasRuntime()) {
				return isAvailable(this, otherChunk);
			} else if (otherChunk.hasRuntime()) {
				return isAvailable(otherChunk, this);
			} else {
				return false;
			}
		}
		if (this.hasEntryModule() || otherChunk.hasEntryModule()) return false;
		return true;
	}

	addMultiplierAndOverhead(size, options) {
		const overhead =
			typeof options.chunkOverhead === "number" ? options.chunkOverhead : 10000;
		const multiplicator = this.canBeInitial()
			? options.entryChunkMultiplicator || 10
			: 1;

		return size * multiplicator + overhead;
	}

	modulesSize() {
		return this._modules.getFromUnorderedCache(getModulesSize);
	}

	size(options) {
		return this.addMultiplierAndOverhead(this.modulesSize(), options);
	}

	integratedSize(otherChunk, options) {
		// Chunk if it's possible to integrate this chunk
		if (!this.canBeIntegrated(otherChunk)) {
			return false;
		}

		let integratedModulesSize = this.modulesSize();
		// only count modules that do not exist in this chunk!
		for (const otherModule of otherChunk._modules) {
			if (!this._modules.has(otherModule)) {
				integratedModulesSize += otherModule.size();
			}
		}

		return this.addMultiplierAndOverhead(integratedModulesSize, options);
	}

	sortModules(sortByFn) {
		this._modules.sortWith(sortByFn || sortById);
	}

	sortItems(sortChunks) {
		this.sortModules();
	}

	getAllAsyncChunks() {
		const initialChunks = new Set();
		const queue = new Set(this.groupsIterable);
		const chunks = new Set();

		for (const chunkGroup of queue) {
			for (const chunk of chunkGroup.chunks) initialChunks.add(chunk);
		}

		for (const chunkGroup of queue) {
			for (const chunk of chunkGroup.chunks) {
				if (!initialChunks.has(chunk)) chunks.add(chunk);
			}
			for (const child of chunkGroup.childrenIterable) queue.add(child);
		}

		return chunks;
	}

	getChunkMaps(realHash) {
		const chunkHashMap = Object.create(null);
		const chunkContentHashMap = Object.create(null);
		const chunkNameMap = Object.create(null);

		for (const chunk of this.getAllAsyncChunks()) {
			chunkHashMap[chunk.id] = realHash ? chunk.hash : chunk.renderedHash;
			for (const key of Object.keys(chunk.contentHash)) {
				if (!chunkContentHashMap[key])
					chunkContentHashMap[key] = Object.create(null);
				chunkContentHashMap[key][chunk.id] = chunk.contentHash[key];
			}
			if (chunk.name) chunkNameMap[chunk.id] = chunk.name;
		}

		return {
			hash: chunkHashMap,
			contentHash: chunkContentHashMap,
			name: chunkNameMap
		};
	}

	getChunkModuleMaps(filterFn) {
		const chunkModuleIdMap = Object.create(null);
		const chunkModuleHashMap = Object.create(null);

		for (const chunk of this.getAllAsyncChunks()) {
			let array;
			for (const module of chunk.modulesIterable) {
				if (filterFn(module)) {
					if (array === undefined) {
						array = [];
						chunkModuleIdMap[chunk.id] = array;
					}
					array.push(module.id);
					chunkModuleHashMap[module.id] = module.renderedHash;
				}
			}
			if (array !== undefined) {
				array.sort();
			}
		}

		return {
			id: chunkModuleIdMap,
			hash: chunkModuleHashMap
		};
	}

	hasModuleInGraph(filterFn, filterChunkFn) {
		const queue = new Set(this.groupsIterable);
		const chunksProcessed = new Set();

		for (const chunkGroup of queue) {
			for (const chunk of chunkGroup.chunks) {
				if (!chunksProcessed.has(chunk)) {
					chunksProcessed.add(chunk);
					if (!filterChunkFn || filterChunkFn(chunk)) {
						for (const module of chunk.modulesIterable)
							if (filterFn(module)) return true;
					}
				}
			}
			for (const child of chunkGroup.childrenIterable) queue.add(child);
		}
		return false;
	}

	toString() {
		return `Chunk[${Array.from(this._modules).join()}]`;
	}
}

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "forEachModule", {
	configurable: false,
	value: util.deprecate(function(fn) {
		this._modules.forEach(fn);
	}, "Chunk.forEachModule: Use for(const module of chunk.modulesIterable) instead")
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "mapModules", {
	configurable: false,
	value: util.deprecate(function(fn) {
		return Array.from(this._modules, fn);
	}, "Chunk.mapModules: Use Array.from(chunk.modulesIterable, fn) instead")
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "chunks", {
	configurable: false,
	get() {
		throw new Error("Chunk.chunks: Use ChunkGroup.getChildren() instead");
	},
	set() {
		throw new Error("Chunk.chunks: Use ChunkGroup.add/removeChild() instead");
	}
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "parents", {
	configurable: false,
	get() {
		throw new Error("Chunk.parents: Use ChunkGroup.getParents() instead");
	},
	set() {
		throw new Error("Chunk.parents: Use ChunkGroup.add/removeParent() instead");
	}
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "blocks", {
	configurable: false,
	get() {
		throw new Error("Chunk.blocks: Use ChunkGroup.getBlocks() instead");
	},
	set() {
		throw new Error("Chunk.blocks: Use ChunkGroup.add/removeBlock() instead");
	}
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "entrypoints", {
	configurable: false,
	get() {
		throw new Error(
			"Chunk.entrypoints: Use Chunks.groupsIterable and filter by instanceof Entrypoint instead"
		);
	},
	set() {
		throw new Error("Chunk.entrypoints: Use Chunks.addGroup instead");
	}
});

module.exports = Chunk;
