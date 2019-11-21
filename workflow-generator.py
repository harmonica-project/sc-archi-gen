#!/usr/bin/env python3

import json
import os
import random
import yaml
import matplotlib.pyplot as plt
from lxml import etree
import copy
import networkx as nx
import re

#IP="10.103.239.199"
IP="localhost"

class Payload:
    def __init__(self, instructions, in_bytes_count, out_bytes_count, dummy_padding):
        self.instructions = instructions
        self.in_bytes_count = in_bytes_count
        self.out_bytes_count = out_bytes_count
        self.dummy_padding = dummy_padding

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

    instructions = random.randint(complexity*0.7,complexity*1.3)
    in_bytes_count = random.randint(complexity*0.7,complexity*1.3)
    out_bytes_count = random.randint(complexity*0.7,complexity*1.3)
    dummy_padding = random.randint(complexity*0.7,complexity*1.3)

    return vars(Payload(instructions, in_bytes_count, out_bytes_count, dummy_padding))


def visit_bpmn(father, nodes, g):
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
                visit_bpmn(node_id, next_tasks, g)




if __name__=='__main__':
    errors = 0
    nb_files = 0

    random.seed(get_seed())

    for file in os.listdir('./bpmns'):
        nb_files = nb_files + 1 
        try:
            root = etree.XML(open("./bpmns/" + file, "r").read().encode("ascii", "ignore"))
            doc = etree.ElementTree(root)
            ns = {'bpmn2': 'http://www.omg.org/spec/BPMN/20100524/MODEL', }

            g = nx.DiGraph()

            start_events = doc.xpath("//bpmn2:startEvent", namespaces=ns)

            g.add_node("START", type="START", payload=get_random_payload("START"))
            visit_bpmn("START", start_events, g)
            # nx.draw(g)
            # nx.draw_networkx_labels(g,pos=nx.spring_layout(g))
            # plt.draw()
            i=8080
            for n in g.nodes:
                g.nodes[n]["url"]="http://%s:%d"%(IP,i)
                #i+=1

            filename = ('.').join(file.split('.')[:-1])
            
            with open('./graphs/' + filename + '.json', 'w+') as graph:
                json.dump(nx.node_link_data(g), graph)

            # print(json.dumps(nx.node_link_data(g)))

        except:
            errors = errors + 1 

    print("Amount of converted files from BPMN directory : " + str(nb_files - errors) + "/" + str(nb_files - 1))
