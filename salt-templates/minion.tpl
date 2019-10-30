rejected_retry: True
mine_interval: 1
hostsfile:
  alias: controlpath_ip
mine_functions:
  datapath_ip:
    - mine_function: network.ip_addrs
    - {{ salt_host_data_iface }}

