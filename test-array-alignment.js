"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sortJsxProps = void 0;
const eslint_plugin_perfectionist_1 = __importDefault(require("eslint-plugin-perfectionist"));
exports.sortJsxProps = {
    plugins: { perfectionist: eslint_plugin_perfectionist_1.default },
    rules: {
        "perfectionist/sort-jsx-props": [
            "warn",
            {
                type: "natural",
                groups: [
                    "key",
                    "ref",
                    "id",
                    "className",
                    "style",
                    "unknown",
                    "data",
                    "callback",
                ],
                customGroups: [
                    { groupName: "key", elementNamePattern: "^key$" },
                    { groupName: "ref", elementNamePattern: "^ref$" },
                    { groupName: "id", elementNamePattern: "^id$" },
                    { groupName: "className", elementNamePattern: "^className$" },
                    { groupName: "style", elementNamePattern: "^style$" },
                    { groupName: "data", elementNamePattern: "^data-.+" },
                    { groupName: "callback", elementNamePattern: "^on.+" },
                ],
            },
        ],
    },
};
//# sourceMappingURL=test-array-alignment.js.map