login: g5klogin
pwd: g5kpwd
api-backend: https://api.grid5000.fr/
ssh_key_file_public: /home/nherbaut/.ssh/g5k.pub
ssh_key_file_private: /home/nherbaut/.ssh/g5k
mailto: nicolas.herbaut@gmail.com
grid5k_ProxyCommand_domain_alias: g5k
environment: debian9-x64-base
default_site: nancy

salt_host_control_iface: eth0
salt_host_data_iface: eth0
salt_minion_template: /home/nherbaut/workspace/simple-g5k-wrapper/salt-templates/minion.tpl
salt_master_template: /home/nherbaut/workspace/simple-g5k-wrapper/salt-templates/master.tpl
salt_states_repo_url: https://gricad-gitlab.univ-grenoble-alpes.fr/vqgroup/salt-master.git
salt_states_repo_branch: auto_install
salt_state_dest_folder: /srv
salt_pre_bootstrap_commands:
  - apt-get update
  - apt-get install git --yes
