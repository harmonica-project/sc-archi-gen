#!/usr/bin/env python3

import json
import os
import random
import yaml

from lxml import etree
import networkx as nx
import re
import traceback
import random



from multiprocessing import Pool, cpu_count

ns = {'bpmn2': 'http://www.omg.org/spec/BPMN/20100524/MODEL', }


class bcolors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


class Payload:
    def __init__(self, instructions, in_bytes_count, out_bytes_count, dummy_padding):
        self.instructions = instructions
        self.in_bytes_count = in_bytes_count
        self.out_bytes_count = out_bytes_count
        self.dummy_padding = dummy_padding


def get_cluster_config():
    with open(r'./ip_list.json') as file:
        cluster_config=json.load(file)
        return cluster_config
        


def get_seed():
    with open(r'./hyperparams.yml') as file:
        # The FullLoader parameter handles the conversion from YAML
        # scalar values to Python the dictionary format
        hyperparams = yaml.load(file, Loader=yaml.FullLoader)
        return hyperparams['SEED']


def get_bench_task_complexity():
    with open(r'./hyperparams.yml') as file:
        # The FullLoader parameter handles the conversion from YAML
        # scalar values to Python the dictionary format
        hyperparams = yaml.load(file, Loader=yaml.FullLoader)
        return hyperparams['BENCH_TASK_COMPLEXITY']


def get_tag_type(element):
    return re.findall("\{.*\}(.*)", element.tag)[0]


def get_random_payload(tag_type):
    complexity = get_bench_task_complexity()

    instructions = random.randint(1, 4)
    in_bytes_count = random.randint(complexity * 0.7, complexity * 1.3)
    out_bytes_count = random.randint(complexity * 0.7, complexity * 1.3)
    dummy_padding = random.randint(complexity * 0.7, complexity * 1.3)

    return vars(Payload(instructions, in_bytes_count, out_bytes_count, dummy_padding))


def visit_bpmn(doc, father, nodes, g):
    for node in nodes:
        if node not in g:
            node_id = node.get("id")
            node_name = node.get("name")

            tag_type = get_tag_type(node)
            if (tag_type.endswith("Gateway")):
                g.add_node(node_id, type=tag_type, gatewayDirection=node.get("gatewayDirection"),
                           payload=get_random_payload(tag_type))
            else:
                g.add_node(node_id, type=get_tag_type(node), payload=get_random_payload(tag_type), name=node_name)
            g.add_edge(father, node_id)
            edge_names = node.xpath("bpmn2:outgoing/text()", namespaces=ns)
            for edge_name in edge_names:
                next_tasks = doc.xpath("//bpmn2:incoming[. = '" + edge_name + "']/..", namespaces=ns)
                visit_bpmn(doc, node_id, next_tasks, g)


def process_bpmn(params):


    file=params[0]
    cluster_config=params[1]

    print("processing %s" % file)

    try:
        root = etree.XML(open("./bpmns/" + file, "r").read().encode("ascii", "ignore"))
        doc = etree.ElementTree(root)   
        g = nx.DiGraph()
        start_events = doc.xpath("//bpmn2:startEvent", namespaces=ns)

        g.add_node("START", type="START", payload=get_random_payload("START"))
        visit_bpmn(doc, "START", start_events, g)
        
        for n in g.nodes:

            host_config=random.choice(cluster_config)
            g.nodes[n]["url"] = "http://%s:8080"%host_config["ip"]
            g.nodes[n]["host"] = host_config["host"]

        filename = ('.').join(file.split('.')[:-1])

        if not os.path.exists('./graphs/'):
            os.makedirs('./graphs/')

        with open('./graphs/' + filename + '.json', 'w+') as graph:
            json.dump(nx.node_link_data(g), graph)

        print((bcolors.OKGREEN + "%s done " + bcolors.ENDC) % file)
        return 1
    except Exception as e:

        traceback.print_exc()
        print((bcolors.FAIL + "%s in error " + bcolors.ENDC) % file)
        return 0


if __name__ == '__main__':
    errors = 0
    nb_files = 0

    random.seed(get_seed())
    pool = Pool(processes=cpu_count() - 1)
    cluster_config=get_cluster_config()
    params=[(f,cluster_config) for f in os.listdir('./bpmns')]
    print(params)
    success = sum(pool.map(process_bpmn,params ))
    print(" %d errors, %d sucess" % (len(os.listdir('./bpmns')) - success, success))
    # process_bpmn("Selbstbedienungrestaurant_7c7e418db39b48f082e9eb21d5524b10.bpmn")
