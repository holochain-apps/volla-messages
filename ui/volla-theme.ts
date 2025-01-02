import type { CustomThemeConfig } from "@skeletonlabs/tw-plugin";

export const vollaTheme: CustomThemeConfig = {
  name: "volla-theme",
  properties: {
    // =~= Theme Properties =~=
    "--theme-font-family-base": `'NotoSans', ui-sans-serif, system-ui`,
    "--theme-font-family-heading": `'NotoSans', ui-sans-serif, system-ui`,
    "--theme-font-color-base": "46 46 46",
    "--theme-font-color-dark": "255 255 255",
    "--theme-rounded-base": "9999px",
    "--theme-rounded-container": "8px",
    "--theme-border-base": "1px",
    // =~= Theme On-X Colors =~=
    "--on-primary": "255 255 255",
    "--on-secondary": "255 255 255",
    "--on-tertiary": "0 0 0",
    "--on-success": "0 0 0",
    "--on-warning": "0 0 0",
    "--on-error": "0 0 0",
    "--on-surface": "0 0 0",
    // =~= Theme Colors  =~=
    // primary | %23FD3524
    "--color-primary-50": "255 225 222", // #ffe1de
    "--color-primary-100": "255 215 211", // #ffd7d3
    "--color-primary-200": "255 205 200", // #ffcdc8
    "--color-primary-300": "254 174 167", // #feaea7
    "--color-primary-400": "254 114 102", // #fe7266
    "--color-primary-500": "253 53 36", // #FD3524
    "--color-primary-600": "255 54 21", // #FF3615
    "--color-primary-700": "190 40 27", // #be281b
    "--color-primary-800": "152 32 22", // #982016
    "--color-primary-900": "124 26 18", // #7c1a12
    // secondary | #2e2e2e
    "--color-secondary-50": "224 224 224", // #e0e0e0
    "--color-secondary-100": "213 213 213", // #d5d5d5
    "--color-secondary-200": "203 203 203", // #cbcbcb
    "--color-secondary-300": "171 171 171", // #ababab
    "--color-secondary-400": "109 109 109", // #6d6d6d
    "--color-secondary-500": "46 46 46", // #2e2e2e
    "--color-secondary-600": "41 41 41", // #292929
    "--color-secondary-700": "35 35 35", // #232323
    "--color-secondary-800": "28 28 28", // #1c1c1c
    "--color-secondary-900": "23 23 23", // #171717
    // tertiary | #ececec
    "--color-tertiary-50": "252 252 252", // #fcfcfc
    "--color-tertiary-100": "251 251 251", // #fbfbfb
    "--color-tertiary-200": "250 250 250", // #fafafa
    "--color-tertiary-300": "247 247 247", // #f7f7f7
    "--color-tertiary-400": "242 242 242", // #f2f2f2
    "--color-tertiary-500": "236 236 236", // #ececec
    "--color-tertiary-600": "212 212 212", // #d4d4d4
    "--color-tertiary-700": "177 177 177", // #b1b1b1
    "--color-tertiary-800": "142 142 142", // #8e8e8e
    "--color-tertiary-900": "116 116 116", // #747474
    // success | #77bb41
    "--color-success-50": "235 245 227", // #ebf5e3
    "--color-success-100": "228 241 217", // #e4f1d9
    "--color-success-200": "221 238 208", // #ddeed0
    "--color-success-300": "201 228 179", // #c9e4b3
    "--color-success-400": "160 207 122", // #a0cf7a
    "--color-success-500": "119 187 65", // #77bb41
    "--color-success-600": "107 168 59", // #6ba83b
    "--color-success-700": "89 140 49", // #598c31
    "--color-success-800": "71 112 39", // #477027
    "--color-success-900": "58 92 32", // #3a5c20
    // warning | #EAB308
    "--color-warning-50": "252 244 218", // #fcf4da
    "--color-warning-100": "251 240 206", // #fbf0ce
    "--color-warning-200": "250 236 193", // #faecc1
    "--color-warning-300": "247 225 156", // #f7e19c
    "--color-warning-400": "240 202 82", // #f0ca52
    "--color-warning-500": "234 179 8", // #EAB308
    "--color-warning-600": "211 161 7", // #d3a107
    "--color-warning-700": "176 134 6", // #b08606
    "--color-warning-800": "140 107 5", // #8c6b05
    "--color-warning-900": "115 88 4", // #735804
    // error | #ff6a00
    "--color-error-50": "255 233 217", // #ffe9d9
    "--color-error-100": "255 225 204", // #ffe1cc
    "--color-error-200": "255 218 191", // #ffdabf
    "--color-error-300": "255 195 153", // #ffc399
    "--color-error-400": "255 151 77", // #ff974d
    "--color-error-500": "255 106 0", // #ff6a00
    "--color-error-600": "230 95 0", // #e65f00
    "--color-error-700": "191 80 0", // #bf5000
    "--color-error-800": "153 64 0", // #994000
    "--color-error-900": "125 52 0", // #7d3400
    // surface | #ffffff
    "--color-surface-50": "255 255 255", // #ffffff
    "--color-surface-100": "255 255 255", // #ffffff
    "--color-surface-200": "255 255 255", // #ffffff
    "--color-surface-300": "255 255 255", // #ffffff
    "--color-surface-400": "255 255 255", // #ffffff
    "--color-surface-500": "255 255 255", // #ffffff
    "--color-surface-600": "230 230 230", // #e6e6e6
    "--color-surface-700": "191 191 191", // #bfbfbf
    "--color-surface-800": "153 153 153", // #999999
    "--color-surface-900": "0 0 0", // #7d7d7d
  },
};
