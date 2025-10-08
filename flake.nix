{
  description = "Template for Holochain app development";

  inputs = {
    holonix.url = "github:holochain/holonix/main";
    p2p-shipyard.url = "github:darksoil-studio/tauri-plugin-holochain/main-0.6";

    nixpkgs.follows = "holonix/nixpkgs";
    #scaffolding.url = "github:darksoil-studio/scaffolding/main-0.5";
  };

  outputs = inputs @ { ... }:
    inputs.holonix.inputs.flake-parts.lib.mkFlake { inherit inputs; }
    {
      systems = builtins.attrNames inputs.holonix.devShells;

      perSystem =
        { inputs', pkgs, system, ...}: {
          devShells.default = pkgs.mkShell {
            packages = (with inputs'.holonix.packages; [
              holochain
              hc
              hcterm
              bootstrap-srv
              lair-keystore
              hc-launch
              hc-scaffold
              hn-introspect
              hc-playground
              rust # For Rust development, with the WASM target included for zome builds
            ]) ++ (with pkgs; [
              nodejs_20 # For UI development
              binaryen # For WASM optimisation
              # Add any other packages you need here
            ]);
            inputsFrom = [
              inputs'.p2p-shipyard.devShells.holochainTauriDev
              inputs'.holonix.devShells.default
            ];

          };
          devShells.androidDev = pkgs.mkShell {
            inputsFrom = [
              inputs'.p2p-shipyard.devShells.holochainTauriAndroidDev
              inputs'.holonix.devShells.default
            ];
          };
        };
    };
}