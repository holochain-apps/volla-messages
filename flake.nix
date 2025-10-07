{
  description = "Template for Holochain app development";

  inputs = {
    holonix.url = "github:holochain/holonix/main-0.5";
    p2p-shipyard.url = "github:darksoil-studio/tauri-plugin-holochain/main-0.5";

    nixpkgs.follows = "holonix/nixpkgs";
    scaffolding.url = "github:darksoil-studio/scaffolding/main-0.5";
  };

  outputs = inputs @ { ... }:
    inputs.holonix.inputs.flake-parts.lib.mkFlake { inherit inputs; }
    {
      systems = builtins.attrNames inputs.holonix.devShells;

      perSystem =
        { inputs', pkgs, system, ...}: {
          devShells.default = pkgs.mkShell {
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