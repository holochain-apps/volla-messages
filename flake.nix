{
  description = "Flake for Holochain app development";

  inputs = {
    tauri-plugin-holochain.url = "github:zo-el/tauri-plugin-holochain/main-0.6-go-pion";
    holonix.url = "github:holochain/holonix/main";
    
    nixpkgs.follows = "holonix/nixpkgs";
    rust-overlay.follows = "holonix/rust-overlay";
    crane.follows = "holonix/crane";

    flake-parts.follows = "holonix/flake-parts";
    playground.url = "github:darksoil-studio/holochain-playground?ref=main-0.5";
  };

  outputs = inputs@{ flake-parts, ... }: flake-parts.lib.mkFlake { inherit inputs; } {
    systems = builtins.attrNames inputs.holonix.devShells;
    perSystem = { inputs', pkgs, system, ... }: {
      # Use upstream rust version
      # packages.rust = inputs.holonix.packages.${system}.rust;

      # Custom rust version
      # packages.rust = let
      #   overlays = [ (import inputs.rust-overlay) ];
      #   pkgs = import inputs.nixpkgs { inherit system overlays; };
      # in pkgs.rust-bin.stable."1.88.0".minimal;

      formatter = pkgs.nixpkgs-fmt;

      devShells.default = pkgs.mkShell {
        inputsFrom = [
              inputs'.tauri-plugin-holochain.devShells.holochainTauriDev inputs'.holonix.devShells.default ];

        packages = (with pkgs; [
          nodejs_20
          binaryen
          inputs'.playground.packages.hc-playground
          yarn
          go_1_24
          
        ]);

        shellHook = ''
          export PS1='\[\033[1;34m\][holonix:\w]\$\[\033[0m\] '
        '';
      };
      devShells.androidDev = pkgs.mkShell {
        inputsFrom = [
              inputs'.tauri-plugin-holochain.devShells.holochainTauriAndroidDev inputs'.holonix.devShells.default ];

        packages = (with pkgs; [
          nodejs_20
          binaryen
          inputs'.playground.packages.hc-playground
          yarn
          go_1_24
          
        ]);

        shellHook = ''
          export PS1='\[\033[1;34m\][holonix:\w]\$\[\033[0m\] '
        '';
      };
    };
  };
}